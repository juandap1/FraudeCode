import { HumanMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../../types/state";
import ModificationCodeChangesPrompt from "../../types/prompts/modify/CodeChanges";
import { useFraudeStore } from "../../store/useFraudeStore";
import { generalModel } from "../../services/llm";

const { updateOutput } = useFraudeStore.getState();

export const createCodeNode = () => {
  return async (state: AgentStateType) => {
    updateOutput(
      "log",
      "💻 [IMPLEMENTATION] Generating code changes (llama3.1:latest)..."
    );

    const prompt = ModificationCodeChangesPrompt(
      state.codeContext,
      state.thinkingProcess,
      state.query
    );

    const promptSize = prompt.length;
    updateOutput("log", `Coder prompt size: ${promptSize} characters`);

    let modifications = "";
    const signal = useFraudeStore.getState().abortController?.signal;
    const stream = await generalModel.stream([new HumanMessage(prompt)], {
      signal,
    });
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const content = chunk.content as string;
      modifications += content;
      updateOutput("markdown", modifications, "Implementation Details");
    }

    updateOutput("log", "Implementation complete.");

    return {
      modifications,
      llmContext: {
        ...state.llmContext,
        coderPromptSize: promptSize,
      },
      status: "code_generated",
    };
  };
};
