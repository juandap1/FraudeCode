import { HumanMessage } from "@langchain/core/messages";
import type { ChatOllama } from "@langchain/ollama";
import type { AgentStateType } from "../../types/state";
import ModificationThinkPrompt from "../../types/prompts/modify/Think";
import { useFraudeStore } from "../../store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

export const createThinkNode = (
  thinkerModel: ChatOllama,
  signal?: AbortSignal
) => {
  return async (state: AgentStateType) => {
    updateOutput("log", "🧠 [THINKING] Analyzing requirements (qwen3:8b)...");

    const prompt = ModificationThinkPrompt(
      state.structuralContext,
      state.codeContext,
      state.query
    );

    const promptSize = prompt.length;
    updateOutput("log", `Thinker prompt size: ${promptSize} characters`);

    updateOutput("markdown", "", "Implementation Plan");
    let thinkingProcess = "";
    const stream = await thinkerModel.stream([new HumanMessage(prompt)], {
      signal,
    });
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const content = chunk.content as string;
      thinkingProcess += content;
      updateOutput("markdown", thinkingProcess, "Implementation Plan");
    }

    updateOutput("log", "Planning complete.");

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
