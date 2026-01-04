import { StateGraph, END, START } from "@langchain/langgraph";
import { ModifierState, type ModifierStateType } from "../../types/state";

// Nodes
import { createSearchQdrantNode } from "../nodes/searchQdrant";
import { createSearchNeo4jNode } from "../nodes/searchNeo4j";
import { createCombineContextNode } from "../nodes/combineContext";
import { createImplementationPlanNode } from "../nodes/implementationPlan";
import { createCodeNode } from "../nodes/codeModifications";
import { createVerifyNode } from "../nodes/verify";
import { createSaveChangesNode } from "../nodes/saveChanges";
import { createUpdateRagNode } from "../nodes/updateRag";
import { useFraudeStore } from "../../store/useFraudeStore";

export default async function langgraphModify(
  query: string,
  promptUserConfirmation: () => Promise<boolean>,
  signal?: AbortSignal
) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

  const workflow = new StateGraph(ModifierState)
    .addNode("searchQdrant", createSearchQdrantNode())
    .addNode("searchNeo4j", createSearchNeo4jNode())
    .addNode("combineContext", createCombineContextNode())
    .addNode("think", createImplementationPlanNode()) // Thinking
    .addNode("code", createCodeNode()) // Thinking skipped if fastChanges
    .addNode("verify", createVerifyNode())
    .addNode("saveChanges", createSaveChangesNode(promptUserConfirmation))
    .addNode("updateRag", createUpdateRagNode());

  workflow.addEdge(START, "searchQdrant");
  workflow.addEdge("searchQdrant", "searchNeo4j");
  workflow.addEdge("searchNeo4j", "combineContext");
  workflow.addEdge("think", "code");
  workflow.addEdge("code", "verify");
  workflow.addEdge("verify", "saveChanges");
  workflow.addEdge("updateRag", END);
  workflow.addConditionalEdges(
    "saveChanges",
    (state: ModifierStateType) => {
      if (state.userConfirmed) {
        return "updateRag";
      }
      return END;
    },
    {
      [END]: END,
      updateRag: "updateRag",
    }
  );
  // Execution mode pathing
  workflow.addConditionalEdges(
    "combineContext",
    () => {
      return useFraudeStore.getState().executionMode;
    },
    {
      Fast: "code",
      Planning: "think",
    }
  );

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
    },
    { signal }
  )) as any;

  return {
    diffs: finalState.diffs,
    userConfirmed: finalState.userConfirmed,
    pendingChanges: finalState.pendingChanges || [],
  };
}
