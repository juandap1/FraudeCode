import { StateGraph, END, START } from "@langchain/langgraph";
import {
  type BaseMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { type DynamicStructuredTool } from "@langchain/core/tools";
import { generalModel, scoutModel } from "../../services/llm";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { useFraudeStore } from "../../store/useFraudeStore";
import log from "../../utils/logger";

interface RouterState {
  messages: BaseMessage[];
}

const { setStatus } = useFraudeStore.getState();

export const createRouterGraph = (tools: DynamicStructuredTool[]) => {
  const modelWithTools = generalModel.bindTools(tools);

  const toolNode = new ToolNode<RouterState>(tools);

  const classifyIntent = async (state: RouterState) => {
    setStatus("Analyzing request");
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) return "general";

    const response = await scoutModel.invoke([
      new SystemMessage(
        "Classify the user query into 'project' if it's related to the current codebase, project structure, coding questions, or requested actions. Classify as 'general' ONLY if it's completely unrelated conversation (greetings, off-topic questions, etc.). IMPORTANT: Respond with exactly one word: 'project' or 'general'."
      ),
      lastMessage,
    ]);
    const usage = response.usage_metadata;
    if (usage) {
      useFraudeStore.getState().updateTokenUsage({
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
      });
    }
    const decision = response.content.toString().toLowerCase().trim();
    log("Scout Decision: ", decision);
    return decision.includes("project") ? "project" : "general";
  };

  const callModel = async (state: RouterState, config?: any) => {
    setStatus("Thinking");
    const messages = state.messages;
    log("CallModel messages count: ", messages.length);

    const response = await modelWithTools.invoke(messages, {
      signal: config?.signal,
    });
    const usage = response.usage_metadata;
    if (usage) {
      useFraudeStore.getState().updateTokenUsage({
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
      });
    }

    if (
      response.content &&
      (!response.tool_calls || response.tool_calls.length === 0)
    ) {
      useFraudeStore
        .getState()
        .updateOutput("markdown", response.content.toString());
    }

    if (response.tool_calls && response.tool_calls.length > 0) {
      log(
        "Tool calls detected: ",
        JSON.stringify(response.tool_calls, null, 2)
      );
    } else {
      log("No tool calls detected in project response.");
    }

    return { messages: [response] };
  };

  const callGeneralModel = async (state: RouterState, config?: any) => {
    setStatus("Pondering");
    const { messages } = state;
    let fullResponse: any = null;
    const stream = await generalModel.stream(messages, {
      signal: config?.signal,
    });
    let lastChunk = null;
    for await (const chunk of stream) {
      fullResponse = fullResponse ? fullResponse.concat(chunk) : chunk;
      lastChunk = chunk;
      if (fullResponse.content) {
        useFraudeStore
          .getState()
          .updateOutput("markdown", fullResponse.content.toString());
      }
    }
    if (lastChunk?.usage_metadata) {
      const usage = lastChunk.usage_metadata;
      useFraudeStore.getState().updateTokenUsage({
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
      });
    }
    return { messages: [fullResponse] };
  };

  const shouldContinue = (state: RouterState) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return END;

    log(
      "Checking if should continue. Last message type: ",
      lastMessage.constructor.name
    );

    if (
      (lastMessage instanceof AIMessage || "tool_calls" in lastMessage) &&
      Array.isArray((lastMessage as any).tool_calls) &&
      (lastMessage as any).tool_calls.length > 0
    ) {
      log(
        "Continuing to tools. Call: ",
        (lastMessage as any).tool_calls[0]?.name
      );
      return "tools";
    }
    log("Ending project flow.");
    return END;
  };

  const workflow = new StateGraph<RouterState>({
    channels: {
      messages: {
        value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
      },
    },
  })
    .addNode("project", callModel)
    .addNode("general", callGeneralModel)
    .addNode("tools", toolNode)
    .addConditionalEdges(START, classifyIntent, {
      project: "project",
      general: "general",
    })
    .addConditionalEdges("project", shouldContinue, {
      tools: "tools",
      [END]: END,
    })
    .addConditionalEdges(
      "tools",
      (state: RouterState) => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (
          lastMessage instanceof ToolMessage &&
          (lastMessage.content.toString().includes("User rejected") ||
            lastMessage.content.toString().includes("successfully applied"))
        ) {
          log("Modifications finalized, ending session early.");
          return END;
        }
        return "project";
      },
      {
        project: "project",
        [END]: END,
      }
    )
    .addEdge("general", END);

  return workflow.compile();
};
