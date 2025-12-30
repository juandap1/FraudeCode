import { HumanMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../../types/state";
import ModificationCodeChangesPrompt from "../../types/prompts/modify/CodeChanges";
import { useFraudeStore } from "../../store/useFraudeStore";
import { generalModel } from "../../services/llm";

const { updateOutput, setStatus } = useFraudeStore.getState();

export const createCodeNode = () => {
  return async (state: AgentStateType, config?: any) => {
    setStatus("Generating code changes (llama3.1:latest)");

    const prompt = ModificationCodeChangesPrompt(
      state.codeContext,
      state.thinkingProcess,
      state.query
    );

    const promptSize = prompt.length;
    updateOutput("log", `Coder prompt size: ${promptSize} characters`);

    let modifications = "";
    const signal = config?.signal;
    const stream = await generalModel.stream([new HumanMessage(prompt)], {
      signal,
    });
    let lastChunk = null;
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const content = chunk.content as string;
      modifications += content;
      lastChunk = chunk;
      updateOutput("markdown", modifications, "Implementation Details");
    }
    if (lastChunk?.usage_metadata) {
      const usage = lastChunk.usage_metadata;

      useFraudeStore.getState().updateTokenUsage({
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
      });
    }
    // setStatus("Implementation complete.");

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
