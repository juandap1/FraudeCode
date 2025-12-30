import { StateGraph, END, START } from "@langchain/langgraph";
import {
  type BaseMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import { type DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOllama } from "@langchain/ollama";
import { ToolNode } from "@langchain/langgraph/prebuilt";

interface RouterState {
  messages: BaseMessage[];
}

export const createRouterGraph = (
  model: ChatOllama,
  tools: DynamicStructuredTool[]
) => {
  const modelWithTools = model.bindTools(tools);

  const toolNode = new ToolNode<RouterState>(tools);

  const callModel = async (state: RouterState) => {
    const { messages } = state;
    const response = await modelWithTools.invoke(messages);
    return { messages: [response] };
  };

  const shouldContinue = (state: RouterState) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage instanceof AIMessage &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      return "tools";
    }
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
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", END);

  return workflow.compile();
};
