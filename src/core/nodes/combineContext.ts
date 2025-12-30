import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

export const createCombineContextNode = () => {
  return async (state: AgentStateType) => {
    updateOutput("log", "📦 [STEP 4/4] Combining context...");

    const codeContextSize = state.codeContext?.length || 0;
    const structuralContextSize = state.structuralContext?.length || 0;

    updateOutput(
      "log",
      `Code context: ${
        codeContextSize > 0 ? "✓" : "✗"
      } (${codeContextSize} chars)\n` +
        `Structural context: ${
          structuralContextSize > 0 ? "✓" : "✗"
        } (${structuralContextSize} chars)\n` +
        "✅ Context gathering complete."
    );

    return {
      status: "context_gathered",
    };
  };
};
