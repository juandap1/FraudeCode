import { HumanMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../../types/state";
import ModificationThinkPrompt from "../../types/prompts/modify/Think";
import { interrupt, useFraudeStore } from "../../store/useFraudeStore";
import { thinkerModel } from "../../services/llm";
import generateIterationPrompt from "../../types/prompts/IteratePlan";
import log from "../../utils/logger";

const { updateOutput, setStatus, updateInteraction } =
  useFraudeStore.getState();

const iterationLoop = async (
  plan: string,
  state: AgentStateType,
  config?: any
) => {
  let approved = false;
  while (!approved) {
    const check = await useFraudeStore
      .getState()
      .promptImplementationPlanCheck();
    log(check);
    approved = check === 0;
    if (check === 1) {
      const comment = await useFraudeStore.getState().commentPromise();
      if (comment.trim() === "") {
        continue;
      }
      updateOutput("comment", comment);
      setStatus("Modifying plan (qwen3:8b)");
      const iteratePrompt = generateIterationPrompt(
        state.query,
        state.codeContext,
        plan,
        comment
      );
      plan = await think(iteratePrompt, config?.signal);
    } else if (check === 2) {
      return { approved: false, plan };
    }
  }
  // Continue
  updateInteraction(state.id, { status: 1 });
  return { approved: true, plan };
};

const think = async (prompt: string, signal?: AbortSignal) => {
  let thinkingProcess = "";
  const stream = await thinkerModel.stream([new HumanMessage(prompt)], {
    signal,
  });
  let lastChunk = null;
  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const content = chunk.content as string;
    thinkingProcess += content;
    lastChunk = chunk;
    updateOutput("markdown", thinkingProcess, "Implementation Plan");
  }
  if (lastChunk?.usage_metadata) {
    const usage = lastChunk.usage_metadata;

    useFraudeStore.getState().updateTokenUsage({
      total: usage.total_tokens,
      prompt: usage.input_tokens,
      completion: usage.output_tokens,
    });
  }
  return thinkingProcess;
};

export const createImplementationPlanNode = () => {
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
    let thinkingProcess = await think(prompt, config?.signal);
    const { approved, plan } = await iterationLoop(
      thinkingProcess,
      state,
      config
    );
    if (!approved) {
      updateOutput("log", "User rejected plan");
      interrupt();
    }
    return {
      thinkingProcess: plan,
      llmContext: {
        ...state.llmContext,
        thinkerPromptSize: promptSize,
      },
      status: "planning_complete",
    };
  };
};
