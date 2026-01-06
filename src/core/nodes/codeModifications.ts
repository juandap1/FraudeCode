import { HumanMessage } from "@langchain/core/messages";
import type { ModifierStateType } from "../../types/state";
import ModificationCodeChangesPrompt from "../../types/prompts/modify/CodeChanges";
import FastCodeChangesPrompt from "../../types/prompts/modify/FastChanges";
import { useFraudeStore } from "../../store/useFraudeStore";
import { generalModel } from "../../services/llm";
import log from "../../utils/logger";
import {
  applyChangesToContent,
  mapLogicalToPhysical,
  reindexAndShift,
} from "../../utils/CodeModifier";

const { updateOutput, setStatus } = useFraudeStore.getState();

// =============================================================================
// Types
// =============================================================================

/** Represents a parsed step from the planning process */
interface PlanStep {
  /** Target file path */
  file?: string;
  /** Task description */
  task?: string;
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parses the thinking process output to extract file/task pairs.
 *
 * Expected format:
 * ```
 * FILE: path/to/file.py
 * - [ ] TASK: Description of the task
 * ---
 * ```
 *
 * @param text - The thinking process text to parse
 * @returns Array of parsed plan steps
 */
const parseFileAndTask = (text: string): PlanStep[] => {
  const results: PlanStep[] = [];
  const fileBlocks = text.split(/FILE:/).filter((block) => block.trim() !== "");

  for (const block of fileBlocks) {
    const lines = block.trim().split("\n");
    const filePath = lines[0]?.trim();
    const content = lines.slice(1).join("\n");
    const taskParts = content
      .split(/\-\s*\[\s*\]\s*TASK:/)
      .filter((t) => t.trim() !== "");

    for (const part of taskParts) {
      const cleanTask = part?.split(/[-]{3,}/)[0]?.trim();
      results.push({
        file: filePath,
        task: cleanTask,
      });
    }
  }

  return results;
};

// =============================================================================
// LLM Interaction
// =============================================================================

/**
 * Generates code modifications by streaming from the LLM.
 *
 * @param prompt - The prompt messages to send
 * @param signal - Optional abort signal
 * @returns The generated modifications string
 */
const generateModifications = async (
  prompt: any[],
  signal?: AbortSignal
): Promise<string> => {
  let modifications = "";
  const stream = await generalModel.stream(prompt, { signal });
  let lastChunk = null;

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const content = chunk.content as string;
    modifications += content;
    lastChunk = chunk;
    updateOutput("markdown", modifications, "Implementation Details");
  }

  log("Coder modifications: ", modifications);

  if (lastChunk?.usage_metadata) {
    const usage = lastChunk.usage_metadata;
    useFraudeStore.getState().updateTokenUsage({
      total: usage.total_tokens,
      prompt: usage.input_tokens,
      completion: usage.output_tokens,
    });
    updateOutput(
      "checkpoint",
      `Generated code changes [${usage.output_tokens} tokens]`
    );
  }

  return modifications;
};

// =============================================================================
// Block Processing
// =============================================================================

/**
 * Processes a modification block by mapping logical line numbers to physical positions.
 *
 * For INSERT operations, the target is set to after the specified range.
 * For DELETE/MODIFY operations, the range is mapped directly.
 *
 * @param block - The modification block string
 * @param contextLines - Lines of the current context
 * @returns The processed block with updated line numbers
 */
const processBlockForContext = (
  block: string,
  contextLines: string[]
): string => {
  let processedBlock = block;
  const rangeMatch = block.match(/RANGE:\s*(\d+)\s*TO\s*(\d+)/i);

  if (!rangeMatch) return processedBlock;

  const logicalStart = parseInt(rangeMatch[1]!, 10);
  const logicalEnd = parseInt(rangeMatch[2]!, 10);
  const isInsert = block.match(/TYPE:\s*INSERT/i);

  if (isInsert) {
    // INSERT: target after the logical range end
    let physicalEnd = mapLogicalToPhysical(contextLines, logicalEnd);
    if (physicalEnd === -1) {
      physicalEnd = mapLogicalToPhysical(contextLines, logicalStart);
    }

    if (physicalEnd !== -1) {
      const targetLine = physicalEnd + 1;
      processedBlock = block.replace(
        /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
        `RANGE: ${targetLine} TO ${targetLine}`
      );
      log(
        `[ContextMap] Mapped INSERT After Logical ${logicalEnd} to Physical ${targetLine}`
      );
    } else {
      // Fallback: use naive offset
      const codeStartIndex =
        contextLines.findIndex((l) => l.trim().startsWith("CODE:")) + 1;
      const naiveTarget = logicalStart + codeStartIndex;
      processedBlock = block.replace(
        /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
        `RANGE: ${naiveTarget} TO ${naiveTarget}`
      );
      log(
        `[ContextMap] Logical INSERT target ${logicalStart} not found. Using naive offset ${naiveTarget}`
      );
    }

    // Strip ORIGINAL block for INSERTs to force "After" placement
    processedBlock = processedBlock.replace(
      /ORIGINAL:([\s\S]*?)CODE:/,
      "ORIGINAL:\nCODE:"
    );
  } else {
    // DELETE/MODIFY: map range directly
    const physicalStart = mapLogicalToPhysical(contextLines, logicalStart);

    if (physicalStart !== -1) {
      let physicalEnd = mapLogicalToPhysical(contextLines, logicalEnd);
      if (physicalEnd === -1) physicalEnd = physicalStart;

      processedBlock = block.replace(
        /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
        `RANGE: ${physicalStart} TO ${physicalEnd}`
      );
      log(
        `[ContextMap] Mapped Logical ${logicalStart}-${logicalEnd} to Physical ${physicalStart}-${physicalEnd}`
      );
    } else {
      // Fallback: use naive offset
      const codeStartIndex =
        contextLines.findIndex((l) => l.trim().startsWith("CODE:")) + 1;
      const naiveStart = logicalStart + codeStartIndex;
      const naiveEnd = logicalEnd + codeStartIndex;
      processedBlock = block.replace(
        /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
        `RANGE: ${naiveStart} TO ${naiveEnd}`
      );
      log(
        `[ContextMap] Logical ${logicalStart} not found. Using naive offset ${naiveStart}`
      );
    }
  }

  return processedBlock;
};

/**
 * Extracts file path from a modification block.
 */
const extractFilePath = (block: string): string => {
  const lines = block.split(/\r?\n/);
  return lines[0]?.trim().replace(/\*+$/, "").replace(/^\*+/, "").trim() || "";
};

/**
 * Splits modifications string into individual blocks.
 */
const splitIntoBlocks = (modifications: string): string[] => {
  return modifications.split(/\bFILE:\s*/i).filter((b) => b.trim().length > 0);
};

// =============================================================================
// Main Node
// =============================================================================

/**
 * Creates the code modifications node for the LangGraph workflow.
 *
 * In Planning mode:
 * - Parses tasks from the thinking process
 * - Generates modifications for each task sequentially
 * - Updates context in-memory after each modification
 * - Re-indexes line numbers after changes
 *
 * In Fast mode:
 * - Generates all modifications in a single pass
 */
export const createCodeNode = () => {
  return async (state: ModifierStateType, config?: any) => {
    log("Coder state: ", JSON.stringify(state, null, 2));
    setStatus("Generating code changes (llama3.1:latest)");

    let modifications = "";

    if (useFraudeStore.getState().executionMode === "Planning") {
      const tasks = parseFileAndTask(state.thinkingProcess);

      for (const task of tasks) {
        const filePath = task.file || "";
        const currentContext = state.mappedContext[filePath] || "";

        const prompt = ModificationCodeChangesPrompt(
          currentContext,
          `IN ${filePath}: ${task.task || ""}`
        );
        log("Coder prompt: ", currentContext);

        const promptSize = prompt.length;
        updateOutput("log", `Coder prompt size: ${promptSize} characters`);

        const newModifications = await generateModifications(
          prompt,
          config?.signal
        );
        modifications += newModifications + "\n\n";

        // Process and apply modifications to context
        const blocks = splitIntoBlocks(newModifications);

        for (const block of blocks) {
          const blockFilePath = extractFilePath(block);
          const targetFile = blockFilePath || filePath;

          if (state.mappedContext[targetFile]) {
            const contextLines = state.mappedContext[targetFile]!.split("\n");
            const processedBlock = processBlockForContext(block, contextLines);

            // Apply changes to context
            const updatedContent = applyChangesToContent(
              state.mappedContext[targetFile]!,
              [processedBlock],
              targetFile,
              (type, msg) => log(`[ContextUpdate] ${msg}`)
            );

            // Re-index line numbers
            state.mappedContext[targetFile] = reindexAndShift(updatedContent);
            log(`Updated context for ${targetFile} after task: ${task.task}`);
          }
        }
      }
    } else {
      // Fast mode
      const prompt = FastCodeChangesPrompt(state.codeContext, state.query);
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
