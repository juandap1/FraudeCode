import type Neo4jClient from "../../services/neo4j";
import { SummaryState } from "../../types/state";
import { StateGraph, END, START } from "@langchain/langgraph";
import { createGetProjectStructureNode } from "../nodes/getProjectStructure";
import { createSearchQdrantNode } from "../nodes/searchQdrant";
import { createSummarizeNode } from "../nodes/summarize";
import { useFraudeStore } from "../../store/useFraudeStore";

export default async function summarizeProject(signal?: AbortSignal) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

  const workflow = new StateGraph(SummaryState)
    .addNode("getProjectStructure", createGetProjectStructureNode())
    .addNode("searchQdrant", createSearchQdrantNode())
    .addNode("summarize", createSummarizeNode());

  workflow.addEdge(START, "getProjectStructure");
  workflow.addEdge("getProjectStructure", "searchQdrant");
  workflow.addEdge("searchQdrant", "summarize");
  workflow.addEdge("summarize", END);

  const query = "Overview of the project functions and classes";

  const app = workflow.compile();
  const finalState = (await app.invoke(
    {
      id: useFraudeStore.getState().currentInteractionId || "",
      query,
      repoName,
      repoPath,
      status: "started",
    },
    { signal }
  )) as any;

  return {
    summary: finalState.summary,
  };
}
