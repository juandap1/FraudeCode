import summarizePrompt from "../../types/prompts/Summarize";
import { useFraudeStore } from "../../store/useFraudeStore";
import { generalModel } from "../../services/llm";
import type { SummaryStateType } from "../../types/state";

const { updateOutput, setStatus } = useFraudeStore.getState();
export const createSummarizeNode = () => {
  return async (state: SummaryStateType, config?: any) => {
    setStatus("Generating summary (llama3.1:latest)");

    let codeContext = "";
    if (state.qdrantResults && state.qdrantResults.length > 0) {
      state.qdrantResults.slice(0, 10).forEach((p: any) => {
        codeContext += `Snippet from ${p.payload.filePath} (symbol: ${p.payload.symbol}):\n${p.payload.rawDocument}\n---\n`;
      });
    }

    //   // 3. Synthesize summary
    const prompt = summarizePrompt(
      state.repoName,
      state.structuralContext,
      codeContext
    );

    const promptSize = prompt.length;
    // updateOutput("log", `Coder prompt size: ${promptSize} characters`);

    let summary = "";
    const signal = config?.signal;
    const stream = await generalModel.stream(prompt, {
      signal,
    });
    let lastChunk = null;
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const content = chunk.content as string;
      summary += content;
      lastChunk = chunk;
      updateOutput("markdown", summary, "Implementation Details");
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
      status: "summary_generated",
    };
  };
};
