import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "../../types/state";

// Nodes
import { createSearchQdrantNode } from "../nodes/searchQdrant";
import { createSearchNeo4jNode } from "../nodes/searchNeo4j";
import { createGatherFilesNode } from "../nodes/gatherFiles";
import { createCombineContextNode } from "../nodes/combineContext";
import { createThinkNode } from "../nodes/thinkModifications";
import { createCodeNode } from "../nodes/codeModifications";
import { createVerifyNode } from "../nodes/verify";
import { createSaveChangesNode } from "../nodes/saveChanges";
import { useFraudeStore } from "../../store/useFraudeStore";

export default async function langgraphModify(
  query: string,
  promptUserConfirmation: () => Promise<boolean>,
  signal?: AbortSignal
) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

  const workflow = new StateGraph(AgentState)
    .addNode("searchQdrant", createSearchQdrantNode())
    .addNode("searchNeo4j", createSearchNeo4jNode())
    .addNode("gatherFiles", createGatherFilesNode())
    .addNode("combineContext", createCombineContextNode())
    .addNode("think", createThinkNode())
    .addNode("code", createCodeNode())
    .addNode("verify", createVerifyNode())
    .addNode("saveChanges", createSaveChangesNode(promptUserConfirmation));

  workflow.addEdge(START, "searchQdrant");
  workflow.addEdge("searchQdrant", "searchNeo4j");
  workflow.addEdge("searchNeo4j", "gatherFiles");
  workflow.addEdge("gatherFiles", "combineContext");
  workflow.addEdge("combineContext", "think");
  workflow.addEdge("think", "code");
  workflow.addEdge("code", "verify");
  workflow.addEdge("verify", "saveChanges");
  workflow.addEdge("saveChanges", END);

  const app = workflow.compile();

  const finalState = (await app.invoke(
    {
      id: useFraudeStore.getState().currentInteractionId || "",
      query,
      repoName,
      repoPath,
      status: "started",
      pendingChanges: [],
      userConfirmed: false,
      llmContext: { thinkerPromptSize: 0, coderPromptSize: 0 },
    },
    { signal }
  )) as any;

  return {
    diffs: finalState.diffs,
    userConfirmed: finalState.userConfirmed,
    pendingChanges: finalState.pendingChanges || [],
  };
}
