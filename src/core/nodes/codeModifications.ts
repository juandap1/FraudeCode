import { HumanMessage } from "@langchain/core/messages";
import type { ModifierStateType } from "../../types/state";
import ModificationCodeChangesPrompt from "../../types/prompts/modify/CodeChanges";
import { useFraudeStore } from "../../store/useFraudeStore";
import { generalModel } from "../../services/llm";
// import FastCodeChangesPrompt from "../../types/prompts/modify/FastChanges";
import FastCodeChangesPrompt2 from "../../types/prompts/modify/FastChangesv2";
import log from "../../utils/logger";

const { updateOutput, setStatus } = useFraudeStore.getState();

interface PlanStep {
  file?: string;
  task?: string;
}

const parseFileAndTask = (text: string): PlanStep[] => {
  const results: PlanStep[] = [];

  // Split by "FILE:" to get blocks for each file
  const fileBlocks = text.split(/FILE:/).filter((block) => block.trim() !== "");

  for (const block of fileBlocks) {
    const lines = block.trim().split("\n");
    const filePath = lines[0]?.trim();

    // Join remaining lines and split by the Task marker
    const content = lines.slice(1).join("\n");
    const taskParts = content
      .split(/\-\s*\[\s*\]\s*TASK:/)
      .filter((t) => t.trim() !== "");

    for (const part of taskParts) {
      // Clean up the task: remove the dashed separator lines and trailing whitespace
      const cleanTask = part?.split(/[-]{3,}/)[0]?.trim();

      results.push({
        file: filePath,
        task: cleanTask,
      });
    }
  }

  return results;
};

const generateModifications = async (prompt: any[], signal?: AbortSignal) => {
  let modifications = "";
  const stream = await generalModel.stream(prompt, {
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
  log("Coder modifications: ", modifications);
  let usage = null;
  if (lastChunk?.usage_metadata) {
    usage = lastChunk.usage_metadata;

    useFraudeStore.getState().updateTokenUsage({
      total: usage.total_tokens,
      prompt: usage.input_tokens,
      completion: usage.output_tokens,
    });
  }
  updateOutput(
    "checkpoint",
    `Generated code changes [${usage?.output_tokens} tokens]`
  );
  return modifications;
};

export const createCodeNode = () => {
  return async (state: ModifierStateType, config?: any) => {
    log("Coder state: ", JSON.stringify(state, null, 2));
    setStatus("Generating code changes (llama3.1:latest)");
    let prompt = null;
    let modifications = "";

    if (useFraudeStore.getState().executionMode === "Planning") {
      const tasks = parseFileAndTask(state.thinkingProcess);
      for (const task of tasks) {
        const filePath = task.file || "";
        const prompt = ModificationCodeChangesPrompt(
          state.mappedContext[filePath] || "",
          `IN ${filePath}: ${task.task || ""}`
        );
        log("Coder prompt: ", prompt);

        const promptSize = prompt.length;
        updateOutput("log", `Coder prompt size: ${promptSize} characters`);

        modifications +=
          (await generateModifications(prompt, config?.signal)) + "\n\n";
      }
    } else {
      //state.dependencies - neo4j structure generated call dependencies
      prompt = FastCodeChangesPrompt2(state.codeContext, state.query);
      log("Coder prompt: ", prompt);

      const promptSize = prompt.length;
      updateOutput("log", `Coder prompt size: ${promptSize} characters`);

      modifications = await generateModifications(prompt, config?.signal);
    }

    return {
      modifications,
      status: "code_generated",
    };
  };
};
