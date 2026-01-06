import * as fs from "fs";
import * as path from "path";
import type { PendingChange } from "../types/state";

// =============================================================================
// Constants
// =============================================================================

/** Regex patterns for parsing modification blocks */
const PATTERNS = {
  /** Matches RANGE: X TO Y format */
  RANGE: /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
  /** Matches TYPE: INSERT|DELETE|MODIFY */
  TYPE: /TYPE:\s*(INSERT|DELETE|MODIFY)/i,
  /** Matches ORIGINAL block with optional code fence */
  ORIGINAL_FENCED: /ORIGINAL:\s*```(?:\w+)?\s*\n([\s\S]*?)```/i,
  /** Matches ORIGINAL block without code fence */
  ORIGINAL_PLAIN: /ORIGINAL:\s*([\s\S]*?)(?=CODE:|$)/i,
  /** Matches CODE block with optional code fence */
  CODE_FENCED: /CODE:\s*```(?:\w+)?\s*\n([\s\S]*?)```/i,
  /** Matches CODE block without code fence */
  CODE_PLAIN: /CODE:\s*([\s\S]*?)$/i,
  /** Matches single line number prefix (e.g., "10:") */
  SINGLE_LINE_NUM: /^(\d+):/,
  /** Matches range line number prefix (e.g., "10 - 15:") */
  RANGE_LINE_NUM: /^(\d+)\s*-\s*(\d+):/,
} as const;

// =============================================================================
// Types
// =============================================================================

/** Types of code modifications */
export type ModificationType = "INSERT" | "DELETE" | "MODIFY" | null;

/** Represents a parsed code modification */
interface Modification {
  rangeStart: number;
  rangeEnd: number;
  original?: string;
  code?: string;
  explicitType?: ModificationType;
  type: "legacy" | "new";
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalizes a string for comparison by trimming and collapsing whitespace.
 */
const normalize = (s: string): string => s.trim().replace(/\s+/g, " ");

/**
 * Cleans a code block by removing leading/trailing empty lines while preserving indentation.
 */
const cleanBlock = (s: string): string => {
  const lines = s.split(/\r?\n/);
  while (lines.length > 0 && lines[0]?.trim() === "" && lines[0] !== "") {
    lines.shift();
  }
  if (lines.length > 0 && lines[0]?.trim() === "") lines.shift();
  if (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
  return lines.join("\n");
};

/**
 * Maps a logical line number to its physical index in a skeleton context.
 *
 * Skeleton contexts use special numbering like "10:" or "10-15:" to represent
 * collapsed/summarized code sections. This function finds the physical line
 * index (1-based) for a given logical line number.
 *
 * @param lines - Array of context lines
 * @param logical - The logical line number to find
 * @returns The 1-based physical line index, or -1 if not found
 */
export const mapLogicalToPhysical = (
  lines: string[],
  logical: number
): number => {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const singleMatch = line?.match(PATTERNS.SINGLE_LINE_NUM);
    const rangeMatch = line?.match(PATTERNS.RANGE_LINE_NUM);

    if (singleMatch) {
      if (parseInt(singleMatch[1]!, 10) === logical) return i + 1;
    }
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]!, 10);
      const end = parseInt(rangeMatch[2]!, 10);
      if (logical >= start && logical <= end) return i + 1;
    }
  }
  return -1;
};

/**
 * Re-indexes line numbers in a skeleton context after modifications.
 *
 * After inserting or removing lines, this function updates all line number
 * prefixes to maintain consistency. Newly inserted lines (those without
 * existing prefixes) are assigned sequential numbers.
 *
 * @param text - The skeleton context text to reindex
 * @returns The reindexed text with updated line numbers
 */
export const reindexAndShift = (text: string): string => {
  const lines = text.split("\n");
  let insideCode = false;
  let shiftOffset = 0;
  let lastPrintedNum = 0;

  return lines
    .map((line) => {
      if (line.trim().startsWith("CODE:")) {
        insideCode = true;
        return line;
      }
      if (line.trim().startsWith("FILE:")) {
        insideCode = false;
        return line;
      }
      if (!insideCode) return line;

      const trimmed = line.trim();
      if (!trimmed) return line;

      const rangeMatch = line.match(PATTERNS.RANGE_LINE_NUM);
      const singleMatch = line.match(PATTERNS.SINGLE_LINE_NUM);

      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]!, 10);
        const end = parseInt(rangeMatch[2]!, 10);
        const s = start + shiftOffset;
        const e = end + shiftOffset;
        lastPrintedNum = e;
        return line.replace(PATTERNS.RANGE_LINE_NUM, `${s} - ${e}:`);
      } else if (singleMatch) {
        const num = parseInt(singleMatch[1]!, 10);
        const newNum = num + shiftOffset;
        lastPrintedNum = newNum;
        return line.replace(PATTERNS.SINGLE_LINE_NUM, `${newNum}:`);
      } else {
        // Skip placeholders
        if (
          trimmed === "..." ||
          trimmed === "[EMPTY LINES]" ||
          line.includes("// ...")
        ) {
          return line;
        }
        // Newly inserted line - assign next number
        shiftOffset++;
        lastPrintedNum++;
        return `${lastPrintedNum}: ${line}`;
      }
    })
    .join("\n");
};

// =============================================================================
// Block Parsing
// =============================================================================

/**
 * Parses a new-format modification block (RANGE: X TO Y).
 */
const parseNewFormatBlock = (
  block: string,
  filePath: string,
  updateOutput: (type: "log", content: string) => void
): Modification | null => {
  const rangeMatch = block.match(PATTERNS.RANGE);
  if (!rangeMatch) return null;

  const rangeStart = parseInt(rangeMatch[1]!, 10);
  const rangeEnd = parseInt(rangeMatch[2]!, 10);

  const typeMatch = block.match(PATTERNS.TYPE);
  const explicitType =
    (typeMatch?.[1]?.toUpperCase() as ModificationType) ?? null;

  const originalMatch =
    block.match(PATTERNS.ORIGINAL_FENCED) ||
    block.match(PATTERNS.ORIGINAL_PLAIN);
  const codeMatch =
    block.match(PATTERNS.CODE_FENCED) || block.match(PATTERNS.CODE_PLAIN);

  let original =
    originalMatch?.[1] !== undefined
      ? cleanBlock(originalMatch[1])
      : originalMatch?.[2]?.trim() || "";

  let code =
    codeMatch?.[1] !== undefined
      ? cleanBlock(codeMatch[1])
      : codeMatch?.[2]?.trim() || "";

  // Handle explicit type semantics
  if (explicitType === "INSERT") {
    updateOutput(
      "log",
      `[${filePath}] Explicit INSERT detected at ${rangeStart}`
    );
  } else if (explicitType === "DELETE") {
    code = "";
    updateOutput(
      "log",
      `[${filePath}] Explicit DELETE detected at ${rangeStart}-${rangeEnd}`
    );
  }

  return {
    rangeStart,
    rangeEnd,
    original,
    code,
    explicitType,
    type: "new",
  };
};

/**
 * Parses legacy-format modification blocks (AT LINE X).
 */
const parseLegacyFormatBlocks = (block: string): Modification[] => {
  const modifications: Modification[] = [];
  const atLineSections = block.split(/\bAT LINE\s+/i);

  for (let i = 1; i < atLineSections.length; i++) {
    const section = atLineSections[i];
    if (!section) continue;

    const lineMatch = section.match(/^(\d+)/);
    if (!lineMatch) continue;

    const lineNum = parseInt(lineMatch[1]!, 10);
    const removeMatch = section.match(
      /REMOVE:\s*```(?:\w+)?\r?\n([\s\S]*?)```/i
    );
    const addMatch = section.match(/ADD:\s*```(?:\w+)?\r?\n([\s\S]*?)```/i);

    if (removeMatch || addMatch) {
      modifications.push({
        rangeStart: lineNum,
        rangeEnd: lineNum,
        original: removeMatch?.[1]?.trimEnd(),
        code: addMatch?.[1]?.trimEnd(),
        type: "legacy",
      });
    }
  }

  return modifications;
};

// =============================================================================
// Fuzzy Search
// =============================================================================

/**
 * Performs fuzzy search for original content in the target lines.
 *
 * @returns Object with foundIndex and removeCount, or null if not found
 */
const fuzzySearchOriginal = (
  contentLines: string[],
  originalLines: string[],
  expectedStartIndex: number,
  change: Modification,
  filePath: string,
  updateOutput: (type: "log", content: string) => void
): { foundIndex: number; removeCount: number } | null => {
  const removeCount =
    change.explicitType === "INSERT" ? 0 : originalLines.length;

  // Search with expanding offsets from expected position
  const searchOffsets = [0];
  for (let i = 1; i <= 100; i++) {
    searchOffsets.push(i, -i);
  }

  for (const offset of searchOffsets) {
    const checkIndex = expectedStartIndex + offset;
    if (
      checkIndex < 0 ||
      checkIndex + originalLines.length > contentLines.length
    ) {
      continue;
    }

    let match = true;
    for (let i = 0; i < originalLines.length; i++) {
      if (
        normalize(contentLines[checkIndex + i]!) !==
        normalize(originalLines[i]!)
      ) {
        match = false;
        break;
      }
    }

    if (match) {
      let foundIndex = checkIndex;
      if (change.explicitType === "INSERT") {
        foundIndex += originalLines.length;
      }
      updateOutput(
        "log",
        `✅ Match found at line ${foundIndex + 1} (offset ${
          foundIndex - expectedStartIndex
        }) in ${filePath}`
      );
      return { foundIndex, removeCount };
    }
  }

  // Global search fallback
  updateOutput(
    "log",
    `⚠️ Range mismatch for ${filePath}, searching globally...`
  );
  for (let i = 0; i <= contentLines.length - originalLines.length; i++) {
    let match = true;
    for (let j = 0; j < originalLines.length; j++) {
      if (normalize(contentLines[i + j]!) !== normalize(originalLines[j]!)) {
        match = false;
        break;
      }
    }
    if (match) {
      let foundIndex = i;
      if (change.explicitType === "INSERT") {
        foundIndex += originalLines.length;
      }
      updateOutput(
        "log",
        `✅ Found original block at line ${foundIndex + 1} (Global Search)`
      );
      return { foundIndex, removeCount };
    }
  }

  return null;
};

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Applies code modifications to content string.
 *
 * Supports two formats:
 * - New format: RANGE: X TO Y with TYPE, ORIGINAL, CODE blocks
 * - Legacy format: AT LINE X with REMOVE/ADD blocks
 *
 * @param content - The original content string
 * @param blocks - Array of modification block strings
 * @param filePath - File path for logging
 * @param updateOutput - Callback for logging
 * @returns The modified content string
 */
export const applyChangesToContent = (
  content: string,
  blocks: string[],
  filePath: string,
  updateOutput: (type: "log", content: string) => void
): string => {
  let contentLines = content.split(/\r?\n/);
  const changes: Modification[] = [];

  // Parse all blocks
  for (const block of blocks) {
    const newFormat = parseNewFormatBlock(block, filePath, updateOutput);
    if (newFormat) {
      changes.push(newFormat);
    } else {
      changes.push(...parseLegacyFormatBlocks(block));
    }
  }

  changes.sort((a, b) => a.rangeStart - b.rangeStart);

  let currentOffset = 0;

  for (const change of changes) {
    const { rangeStart, rangeEnd, original, code } = change;
    const expectedStartIndex = rangeStart - 1 + currentOffset;

    let foundIndex = -1;
    let removeCount = 0;

    if (original && original.length > 0) {
      const originalLines = original.split(/\r?\n/);
      const result = fuzzySearchOriginal(
        contentLines,
        originalLines,
        expectedStartIndex,
        change,
        filePath,
        updateOutput
      );

      if (result) {
        foundIndex = result.foundIndex;
        removeCount = result.removeCount;
      }
    } else if (
      change.explicitType === "INSERT" ||
      change.rangeStart === change.rangeEnd
    ) {
      // INSERT case - use rangeEnd for explicit INSERT
      const targetIndex =
        change.explicitType === "INSERT"
          ? rangeEnd + currentOffset
          : expectedStartIndex;

      foundIndex = Math.max(0, Math.min(targetIndex, contentLines.length));
      removeCount = 0;
      updateOutput("log", `✅ Preparing INSERT at line ${foundIndex + 1}`);
    } else {
      // DELETE case (implicit)
      foundIndex = Math.max(
        0,
        Math.min(expectedStartIndex, contentLines.length)
      );
      removeCount = Math.max(0, rangeEnd - rangeStart + 1);
      updateOutput(
        "log",
        `⚠️ Deleting range ${rangeStart}-${rangeEnd} without ORIGINAL block validation`
      );
    }

    // Fallback for INSERT when original not found
    if (foundIndex === -1) {
      if (change.explicitType === "INSERT") {
        updateOutput(
          "log",
          `⚠️ Original block not found for INSERT in ${filePath}. Falling back to range-based insertion at line ${rangeEnd}.`
        );
        foundIndex = Math.max(
          0,
          Math.min(rangeEnd + currentOffset, contentLines.length)
        );
        removeCount = 0;
      } else {
        updateOutput(
          "log",
          `❌ FAILURE: Could not find ORIGINAL block in ${filePath} at lines ${rangeStart}-${rangeEnd}`
        );
        continue;
      }
    }

    const linesBefore = contentLines.length;
    let replacementLines = code ? code.split(/\r?\n/) : [];

    // Add whitespace padding if needed
    if (replacementLines.length > 0) {
      if (foundIndex > 0 && contentLines[foundIndex - 1]?.trim() !== "") {
        replacementLines.unshift("");
      }
      if (
        foundIndex + removeCount < contentLines.length &&
        contentLines[foundIndex + removeCount]?.trim() !== ""
      ) {
        replacementLines.push("");
      }
    }

    contentLines.splice(foundIndex, removeCount, ...replacementLines);
    currentOffset += contentLines.length - linesBefore;
  }

  return contentLines.join("\n");
};

/**
 * Resolves a file path within a repository, searching recursively if necessary.
 *
 * @param filePath - The relative file path to resolve
 * @param repoPath - The repository root path
 * @returns The absolute path if found, null otherwise
 */
export const resolvePath = (
  filePath: string,
  repoPath: string
): string | null => {
  const absPath = path.join(repoPath, filePath);
  if (fs.existsSync(absPath)) return absPath;

  const fileName = path.basename(filePath);

  const searchForFile = (dir: string): string | null => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (file === "node_modules" || file === ".git") continue;
        const found = searchForFile(fullPath);
        if (found) return found;
      } else if (file === fileName) {
        return fullPath;
      }
    }
    return null;
  };

  return searchForFile(repoPath);
};

/**
 * Applies targeted changes to files on disk.
 *
 * Parses modification blocks, resolves file paths, applies changes,
 * and returns pending changes for review/application.
 *
 * @param modifications - The raw modifications string
 * @param repoPath - The repository root path
 * @param updateOutput - Callback for logging
 * @returns Array of pending changes with old/new content
 */
export const applyTargetedChanges = (
  modifications: string,
  repoPath: string,
  updateOutput: (type: "log", content: string) => void
): PendingChange[] => {
  const pendingChanges: PendingChange[] = [];

  const fileBlocks = modifications
    .split(/\bFILE:\s*/i)
    .filter((b) => b.trim().length > 0);

  // Group blocks by file
  const blocksByFile: Record<string, string[]> = {};
  for (const block of fileBlocks) {
    const blockLines = block.split(/\r?\n/);
    if (
      blockLines[1]?.trim().startsWith("NO CHANGES") ||
      blockLines[2]?.trim().startsWith("NO CHANGES")
    ) {
      continue;
    }

    const filePath = blockLines[0]
      ?.trim()
      .replace(/\*+$/, "")
      .replace(/^\*+/, "")
      .trim();

    if (filePath) {
      if (!blocksByFile[filePath]) {
        blocksByFile[filePath] = [];
      }
      blocksByFile[filePath].push(block);
    }
  }

  // Process each file
  for (const [filePath, blocks] of Object.entries(blocksByFile)) {
    const absPath = resolvePath(filePath, repoPath);
    if (!absPath) {
      updateOutput(
        "log",
        `[applyTargetedChanges] WARNING: File does not exist: ${filePath}`
      );
      continue;
    }

    const oldContent = fs.readFileSync(absPath, "utf8");
    const newContent = applyChangesToContent(
      oldContent,
      blocks,
      filePath,
      updateOutput
    );

    if (newContent !== oldContent) {
      pendingChanges.push({
        filePath,
        absPath,
        oldContent,
        newContent,
      });
    }
  }

  return pendingChanges;
};
