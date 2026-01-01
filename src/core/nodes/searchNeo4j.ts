import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import neo4jClient from "../../services/neo4j";

const { updateOutput, setStatus } = useFraudeStore.getState();
export const createSearchNeo4jNode = () => {
  return async (state: AgentStateType) => {
    setStatus("Searching Neo4j for structural context");
    // Update search query to maybe use filePaths from qdrant search

    const words = state.query.split(/\W+/);
    let structuralContext = "";

    for (const word of words) {
      if (word.length < 3) continue;
      setStatus(`Inspecting symbol: "${word}"`);
      const symContext = await neo4jClient.getContextBySymbol(word);
      if (symContext.length > 0) {
        structuralContext +=
          `Symbol info for "${word}":` +
          JSON.stringify(symContext, null, 2) +
          "";
      }
    }

    const foundSymbols = structuralContext.length > 0;
    updateOutput(
      "log",
      `${
        foundSymbols
          ? "Structural context found."
          : "No structural context found."
      }`
    );
    updateOutput("checkpoint", "Neo4j search complete");

    return {
      structuralContext,
      status: "neo4j_search_complete",
    };
  };
};
