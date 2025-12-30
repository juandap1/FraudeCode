import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import neo4jClient from "../../services/neo4j";

const { updateOutput } = useFraudeStore.getState();
export const createSearchNeo4jNode = () => {
  return async (state: AgentStateType) => {
    updateOutput(
      "log",
      "🧬 [STEP 2/4] Searching Neo4j for structural context..."
    );

    const words = state.query.split(/\W+/);
    let structuralContext = "";

    for (const word of words) {
      if (word.length < 3) continue;
      updateOutput("log", `Inspecting symbol: "${word}"...`);
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

    return {
      structuralContext,
      status: "neo4j_search_complete",
    };
  };
};
