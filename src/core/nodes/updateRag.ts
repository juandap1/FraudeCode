import type { ModifierStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import neo4jClient from "../../services/neo4j";
import qdrantClient from "../../services/qdrant";
import CodeAnalyzer from "../../utils/CodeAnalyzer";
const { updateOutput, setStatus } = useFraudeStore.getState();
export const createUpdateRagNode = () => {
  return async (state: ModifierStateType) => {
    setStatus("Analyzing code changes");
    const analyzer = new CodeAnalyzer();
    await analyzer.reanalyzeFiles(
      {
        name: state.repoName,
        path: state.repoPath,
      },
      state.changedFiles,
      qdrantClient,
      neo4jClient
    );
    updateOutput("log", "RAG updated successfully");
  };
};
