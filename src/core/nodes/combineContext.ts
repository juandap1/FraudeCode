import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";

const { updateOutput, setStatus } = useFraudeStore.getState();

export const createCombineContextNode = () => {
  return async (state: AgentStateType) => {
    setStatus("Combining context");

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
    updateOutput("checkpoint", "Combined context");

    return {
      status: "context_gathered",
    };
  };
};
