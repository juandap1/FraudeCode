import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import neo4jClient from "../../services/neo4j";
import log from "../../utils/logger";

const { updateOutput, setStatus } = useFraudeStore.getState();
export const createSearchNeo4jNode = () => {
  return async (state: AgentStateType) => {
    setStatus("Searching Neo4j for structural context");

    const filePaths: string[] = [];
    const funcs: string[] = [];
    if (state.qdrantResults) {
      for (const res of state.qdrantResults as any[]) {
        const filePath = res.payload.filePath;
        const func = res.payload.symbol;
        if (filePath && !filePaths.includes(filePath)) {
          filePaths.push(filePath);
        }
        if (func && !funcs.includes(func)) {
          funcs.push(func);
        }
      }
    }

    let structuralContext = "";

    for (const symbol of funcs) {
      setStatus(`Inspecting symbol: "${symbol}"`);
      const symContext = await neo4jClient.getContextBySymbol(symbol);
      if (symContext.length > 0) {
        structuralContext +=
          `Symbol info for "${symbol}":` +
          JSON.stringify(symContext, null, 2) +
          "";
        log(`Symbol info for ${symbol}: `, symContext);
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
