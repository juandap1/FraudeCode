import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import neo4jClient from "../../services/neo4j";
import log from "../../utils/logger";

const { updateOutput, setStatus } = useFraudeStore.getState();
export const createSearchNeo4jNode = () => {
  return async (state: AgentStateType) => {
    setStatus("Searching Neo4j for structural context");

    const funcs: string[] = [];
    const filePaths: string[] = [];
    if (state.qdrantResults) {
      for (const res of state.qdrantResults as any[]) {
        const func = res.payload.symbol;
        const filePath = res.payload.filePath;
        if (func && !funcs.includes(func)) {
          funcs.push(func);
        }
        if (filePath && !filePaths.includes(filePath)) {
          filePaths.push(filePath);
        }
      }
    }

    let structuralContext: any[] = [];

    for (const symbol of funcs) {
      setStatus(`Inspecting symbol: "${symbol}"`);
      const symContext = await neo4jClient.getContextBySymbol(symbol);
      if (symContext.length > 0) {
        structuralContext.push(symContext);
      }
    }

    const foundSymbols = structuralContext.length > 0;
    if (foundSymbols) structuralContext = structuralContext.flat();
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
