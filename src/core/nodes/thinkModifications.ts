import { HumanMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../../types/state";
import ModificationThinkPrompt from "../../types/prompts/modify/Think";
import { useFraudeStore } from "../../store/useFraudeStore";
import { thinkerModel } from "../../services/llm";

const { updateOutput, setStatus } = useFraudeStore.getState();

export const createThinkNode = () => {
  return async (state: AgentStateType, config?: any) => {
    setStatus("Analyzing requirements (qwen3:8b)");

    const prompt = ModificationThinkPrompt(
      state.structuralContext,
      state.codeContext,
      state.query
    );

    const promptSize = prompt.length;
    updateOutput("log", `Thinker prompt size: ${promptSize} characters`);

    updateOutput("markdown", "", "Implementation Plan");
    let thinkingProcess = "";
    const signal = config?.signal;
    const stream = await thinkerModel.stream([new HumanMessage(prompt)], {
      signal,
    });
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const content = chunk.content as string;
      thinkingProcess += content;
      updateOutput("markdown", thinkingProcess, "Implementation Plan");
    }

    return {
      thinkingProcess,
      llmContext: {
        ...state.llmContext,
        thinkerPromptSize: promptSize,
      },
      status: "planning_complete",
    };
  };
};
