import type { ModifierStateType } from "../../types/state";
import ModificationThinkPrompt from "../../types/prompts/modify/Think";
import { interrupt, useFraudeStore } from "../../store/useFraudeStore";
import { llm } from "../../services/llm";
import generateIterationPrompt from "../../types/prompts/IteratePlan";
import log from "../../utils/logger";
import { useSettingsStore } from "../../store/settingsStore";

const { updateOutput, setStatus, updateInteraction } =
  useFraudeStore.getState();

const getSettings = () => useSettingsStore.getState();

const iterationLoop = async (
  plan: string,
  state: ModifierStateType,
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
      setStatus(`Modifying plan (${getSettings().thinkerModel})`);
      const iteratePrompt = generateIterationPrompt(
        state.query,
        state.codeContext,
        plan,
        comment
      );
      const { thinkingProcess, usage } = await think(
        iteratePrompt,
        config?.signal
      );
      plan = thinkingProcess;
      updateOutput(
        "checkpoint",
        `Modified plan [${usage?.total_tokens} tokens]`
      );
    } else if (check === 2) {
      return { approved: false, plan };
    }
  }
  // Continue
  updateInteraction(state.id, { status: 1 });
  return { approved: true, plan };
};

const think = async (prompt: any[], signal?: AbortSignal) => {
  let thinkingProcess = "";
  const stream = await llm.think().stream(prompt, {
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
  let usage = null;
  if (lastChunk?.usage_metadata) {
    usage = lastChunk.usage_metadata;

    useFraudeStore.getState().updateTokenUsage({
      total: usage.total_tokens,
      prompt: usage.input_tokens,
      completion: usage.output_tokens,
    });
  }
  return { thinkingProcess, usage };
};

export const createImplementationPlanNode = () => {
  return async (state: ModifierStateType, config?: any) => {
    setStatus(`Analyzing requirements (${getSettings().thinkerModel})`);

    const prompt = ModificationThinkPrompt(state.codeContext, state.query);

    const promptSize = prompt.length;
    updateOutput("log", `Thinker prompt size: ${promptSize} characters`);

    updateOutput("markdown", "", "Implementation Plan");
    const { thinkingProcess, usage } = await think(prompt, config?.signal);
    updateOutput(
      "checkpoint",
      `Created Implementation Plan [${usage?.total_tokens} tokens]`
    );
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
      status: "planning_complete",
    };
  };
};
