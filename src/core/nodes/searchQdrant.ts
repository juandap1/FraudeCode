import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import qdrant from "../../services/qdrant";

const { updateOutput, setStatus } = useFraudeStore.getState();

export const createSearchQdrantNode = () => {
  return async (state: AgentStateType) => {
    setStatus("Searching Qdrant vector database");

    const searchResults = await qdrant.hybridSearch(
      state.repoName,
      state.query
    );

    const filePaths: string[] = [];
    if (searchResults) {
      for (const res of searchResults as any[]) {
        const filePath = res.payload.filePath;
        if (filePath && !filePaths.includes(filePath)) {
          filePaths.push(filePath);
        }
      }
    }

    updateOutput("log", `Found ${filePaths.length} relevant files.`);
    updateOutput("checkpoint", "Qdrant search complete");

    return {
      qdrantResults: searchResults || [],
      filePaths,
      status: "qdrant_search_complete",
    };
  };
};
