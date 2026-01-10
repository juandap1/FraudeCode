import { StateGraph, END, START } from "@langchain/langgraph";
import {
  type BaseMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { type DynamicStructuredTool } from "@langchain/core/tools";
import { llm } from "../../services/llm";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { useFraudeStore } from "../../store/useFraudeStore";
import { RouterState, type RouterStateType } from "../../types/state";
import log from "../../utils/logger";

const { setStatus, updateTokenUsage, updateOutput } = useFraudeStore.getState();

export const createRouterGraph = (tools: DynamicStructuredTool[]) => {
  const modelWithTools = llm.chat().bindTools(tools);

  const toolNode = new ToolNode<RouterStateType>(tools);

  const classifyIntent = async (state: RouterStateType) => {
    setStatus("Analyzing request");
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) return "general";

    const response = await llm
      .scout()
      .invoke([
        new SystemMessage(
          "Classify the user query into 'project' if it's related to the current codebase, project structure, coding questions, or requested actions. Classify as 'general' ONLY if it's completely unrelated conversation (greetings, off-topic questions, etc.). IMPORTANT: Respond with exactly one word: 'project' or 'general'."
        ),
        lastMessage,
      ]);
    const usage = response.usage_metadata;
    if (usage) {
      updateTokenUsage({
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
      });
    }
    const decision = response.content.toString().toLowerCase().trim();
    log("Scout Decision: ", decision);
    updateOutput(
      "checkpoint",
      `Analyzed request [${usage?.total_tokens} tokens]`
    );
    return decision.includes("project") ? "project" : "general";
  };

  const callModel = async (state: RouterStateType, config?: any) => {
    setStatus("Thinking");
    const messages = state.messages;
    log("CallModel messages count: ", messages.length);

    const response = await modelWithTools.invoke(messages, {
      signal: config?.signal,
    });
    const usage = response.usage_metadata;
    if (usage) {
      updateTokenUsage({
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
      });
    }
    log("CallModel response: ", JSON.stringify(response, null, 2));
    log("CallModel usage: ", JSON.stringify(usage, null, 2));

    if (
      response.content &&
      (!response.tool_calls || response.tool_calls.length === 0)
    ) {
      updateOutput("markdown", response.content.toString());
    }
    updateOutput(
      "checkpoint",
      `Considered options [${usage?.total_tokens} tokens]`
    );
    return { messages: [response] };
  };

  const callGeneralModel = async (state: RouterStateType, config?: any) => {
    setStatus("Pondering");
    const { messages } = state;
    let fullResponse: any = null;
    const stream = await llm.chat().stream(messages, {
      signal: config?.signal,
    });
    let lastChunk = null;
    for await (const chunk of stream) {
      fullResponse = fullResponse ? fullResponse.concat(chunk) : chunk;
      lastChunk = chunk;
      if (fullResponse.content) {
        updateOutput("markdown", fullResponse.content.toString());
      }
    }
    if (lastChunk?.usage_metadata) {
      const usage = lastChunk.usage_metadata;
      updateTokenUsage({
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
      });
    }
    return { messages: [fullResponse] };
  };

  const shouldContinue = (state: RouterStateType) => {
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

  const workflow = new StateGraph(RouterState)
    .addNode("project", callModel)
    .addNode("general", callGeneralModel)
    .addNode("tools", toolNode)
    .addConditionalEdges(START, classifyIntent, {
      project: "project", // If the user query is related to the current codebase, project structure, coding questions, or requested actions
      general: "general", // If the user query is completely unrelated conversation (greetings, off-topic questions, etc.)
    })
    .addConditionalEdges("project", shouldContinue, {
      tools: "tools", // If the user query is related to the current codebase, project structure, coding questions, or requested actions
      [END]: END, // If the user query is completely unrelated conversation (greetings, off-topic questions, etc.)
    })
    .addEdge("tools", END)
    .addEdge("general", END);

  return workflow.compile();
};
