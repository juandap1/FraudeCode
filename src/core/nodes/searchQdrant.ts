import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import qdrant from "../../services/qdrant";
import log from "../../utils/logger";

const { updateOutput, setStatus } = useFraudeStore.getState();

export const createSearchQdrantNode = () => {
  return async (state: AgentStateType) => {
    setStatus("Searching Qdrant vector database");

    const searchResults = await qdrant.hybridSearch(
      state.repoName,
      state.query
    );

    updateOutput("checkpoint", "Qdrant search complete");

    return {
      qdrantResults: searchResults || [],
      status: "qdrant_search_complete",
    };
  };
};
