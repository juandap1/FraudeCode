import { HumanMessage } from "@langchain/core/messages";
import type { ChatOllama } from "@langchain/ollama";
import type { AgentStateType } from "../../types/state";
import summarizePrompt from "../../types/prompts/Summarize";
import { useFraudeStore } from "../../store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();
export const createSummarizeNode = (
  coderModel: ChatOllama,
  signal?: AbortSignal
) => {
  return async (state: AgentStateType) => {
    updateOutput("log", "Generating summary (llama3.1:latest)...");

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
    const stream = await coderModel.stream([new HumanMessage(prompt)], {
      signal,
    });
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const content = chunk.content as string;
      summary += content;
      updateOutput("markdown", summary, "Implementation Details");
    }

    updateOutput("log", "Implementation complete.");

    return {
      summary,
      llmContext: {
        ...state.llmContext,
        coderPromptSize: promptSize,
      },
      status: "summary_generated",
    };
  };
};
