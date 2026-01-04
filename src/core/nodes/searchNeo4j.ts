import type { ModifierStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import neo4jClient from "../../services/neo4j";
import log from "../../utils/logger";

const { updateOutput, setStatus } = useFraudeStore.getState();
export const createSearchNeo4jNode = () => {
  return async (state: ModifierStateType) => {
    setStatus("Searching Neo4j for structural context");

    const symbols: { symbol: string; filePath: string }[] = [];
    if (state.qdrantResults) {
      for (const res of state.qdrantResults as any[]) {
        const symbol = res.payload.symbol;
        const filePath = res.payload.filePath;
        if (symbol && !symbols.includes(symbol)) {
          symbols.push({ symbol, filePath });
        }
      }
    }

    let structuralContext: any[] = [];

    if (symbols.length > 0) {
      setStatus(`Inspecting dependencies for ${symbols.length} files`);
      const symbolContext = await neo4jClient.getContextBySymbols(symbols);
      if (symbolContext.length > 0) {
        structuralContext = symbolContext;
      }
    }

    structuralContext.forEach((node: any) =>
      log(JSON.stringify(node, null, 2))
    );

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
