import * as fs from "fs";
import * as path from "path";
import type { PendingChange } from "../types/state";

/**
 * Normalizes a string for comparison by trimming and replacing multiple whitespace with a single space.
 */
const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

export const applyTargetedChanges = (
  modifications: string,
  repoPath: string,
  updateOutput: (type: "log", content: string) => void
): PendingChange[] => {
  const pendingChanges: PendingChange[] = [];

  const fileBlocks = modifications
    .split(/\bFILE:\s*/i)
    .filter((b) => b.trim().length > 0);

  const blocksByFile: Record<string, string[]> = {};
  for (const block of fileBlocks) {
    const blockLines = block.split(/\r?\n/);
    if (
      blockLines[1]?.trim().startsWith("NO CHANGES") ||
      blockLines[2]?.trim().startsWith("NO CHANGES")
    )
      continue;
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

  const resolvePath = (filePath: string): string | null => {
    let absPath = path.join(repoPath, filePath);
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

  for (const [filePath, blocks] of Object.entries(blocksByFile)) {
    const absPath = resolvePath(filePath);
    if (!absPath) {
      updateOutput(
        "log",
        `[applyTargetedChanges] WARNING: File does not exist: ${filePath}`
      );
      continue;
    }

    let oldContent = fs.readFileSync(absPath, "utf8");
    let contentLines = oldContent.split(/\r?\n/);

    interface Modification {
      rangeStart: number;
      rangeEnd: number;
      original?: string;
      code?: string;
      type: "legacy" | "new";
    }
    const changes: Modification[] = [];

    for (const block of blocks) {
      // 1. Check for New Format (RANGE: X TO Y)
      const rangeMatch = block.match(/RANGE:\s*(\d+)\s*TO\s*(\d+)/i);
      if (rangeMatch) {
        const rangeStart = parseInt(rangeMatch[1]!, 10);
        const rangeEnd = parseInt(rangeMatch[2]!, 10);

        const cleanBlock = (s: string) => {
          // Remove leading and trailing empty lines but keep indentation of content lines
          const lines = s.split(/\r?\n/);
          while (lines.length > 0 && lines[0]?.trim() === "" && lines[0] !== "")
            lines.shift();
          // Wait, if lines[0] is "    ", trim() is "", but it has indentation.
          // We only want to remove lines that are TRULY empty or just have a newline.
          // Actually, many LLMs put the first line right after the backticks.

          if (lines.length > 0 && lines[0]?.trim() === "") lines.shift();
          if (lines.length > 0 && lines[lines.length - 1]?.trim() === "")
            lines.pop();

          return lines.join("\n");
        };

        const originalMatch =
          block.match(/ORIGINAL:\s*```(?:\w+)?\s*\n([\s\S]*?)```/i) ||
          block.match(/ORIGINAL:\s*([\s\S]*?)(?=CODE:|$)/i);
        const codeMatch =
          block.match(/CODE:\s*```(?:\w+)?\s*\n([\s\S]*?)```/i) ||
          block.match(/CODE:\s*([\s\S]*?)$/i);

        const original =
          originalMatch?.[1] !== undefined
            ? cleanBlock(originalMatch[1])
            : originalMatch?.[2]?.trim();
        const code =
          codeMatch?.[1] !== undefined
            ? cleanBlock(codeMatch[1])
            : codeMatch?.[2]?.trim();

        changes.push({
          rangeStart,
          rangeEnd,
          original,
          code,
          type: "new",
        });
      } else {
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
          const addMatch = section.match(
            /ADD:\s*```(?:\w+)?\r?\n([\s\S]*?)```/i
          );

          if (removeMatch || addMatch) {
            changes.push({
              rangeStart: lineNum,
              rangeEnd: lineNum,
              original: removeMatch?.[1]?.trimEnd(),
              code: addMatch?.[1]?.trimEnd(),
              type: "legacy",
            });
          }
        }
      }
    }

    changes.sort((a, b) => a.rangeStart - b.rangeStart);

    let currentOffset = 0;
    let failedChanges = 0;

    for (const change of changes) {
      const { rangeStart, rangeEnd, original, code } = change;
      const expectedStartIndex = rangeStart - 1 + currentOffset;

      let foundIndex = -1;
      let removeCount = 0;

      if (original && original.length > 0) {
        const originalLines = original.split(/\r?\n/);
        removeCount = originalLines.length;

        const searchOffsets = [0];
        for (let i = 1; i <= 100; i++) {
          searchOffsets.push(i, -i);
        }

        for (const offset of searchOffsets) {
          const checkIndex = expectedStartIndex + offset;
          if (
            checkIndex < 0 ||
            checkIndex + originalLines.length > contentLines.length
          )
            continue;

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
            foundIndex = checkIndex;
            updateOutput(
              "log",
              `✅ Match found at line ${foundIndex + 1} (offset ${
                foundIndex - (rangeStart - 1)
              }) in ${filePath}`
            );
            break;
          }
        }

        if (foundIndex === -1) {
          updateOutput(
            "log",
            `⚠️ Range mismatch for ${filePath}, searching globally...`
          );
          for (
            let i = 0;
            i <= contentLines.length - originalLines.length;
            i++
          ) {
            let match = true;
            for (let j = 0; j < originalLines.length; j++) {
              if (
                normalize(contentLines[i + j]!) !== normalize(originalLines[j]!)
              ) {
                match = false;
                break;
              }
            }
            if (match) {
              foundIndex = i;
              updateOutput(
                "log",
                `✅ Found original block at line ${
                  foundIndex + 1
                } (Global Search)`
              );
              break;
            }
          }
        }
      } else if (change.rangeStart === change.rangeEnd) {
        foundIndex = Math.max(
          0,
          Math.min(expectedStartIndex, contentLines.length)
        );
        removeCount = 0;
        updateOutput("log", `✅ Preparing INSERT at line ${foundIndex + 1}`);
      } else {
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

      if (foundIndex === -1) {
        updateOutput(
          "log",
          `❌ FAILURE: Could not find ORIGINAL block in ${filePath} at lines ${rangeStart}-${rangeEnd}`
        );
        failedChanges++;
        continue;
      }

      const linesBefore = contentLines.length;
      let replacementLines = code ? code.split(/\r?\n/) : [];

      if (replacementLines.length > 0) {
        // Ensure whitespace around the change
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

      const linesAfter = contentLines.length;
      currentOffset += linesAfter - linesBefore;
    }

    if (failedChanges < changes.length || changes.length === 0) {
      pendingChanges.push({
        filePath,
        absPath,
        oldContent,
        newContent: contentLines.join("\n"),
      });
    }
  }

  return pendingChanges;
};
