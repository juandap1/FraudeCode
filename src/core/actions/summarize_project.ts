import type Neo4jClient from "../../services/neo4j";
import { AgentState } from "../../types/state";
import { StateGraph, END, START } from "@langchain/langgraph";
import { createGetProjectStructureNode } from "../nodes/getProjectStructure";
import { createSearchQdrantNode } from "../nodes/searchQdrant";
import { createSummarizeNode } from "../nodes/summarize";

export default async function summarizeProject(signal?: AbortSignal) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

  const workflow = new StateGraph(AgentState)
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
    summary: finalState.summary,
  };
}
