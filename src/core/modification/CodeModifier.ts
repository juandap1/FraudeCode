import * as fs from "fs";
import * as path from "path";
import type { PendingChange } from "../../types/state";

export const applyTargetedChanges = (
  modifications: string,
  repoPath: string,
  updateOutput: (type: "log", content: string) => void
): PendingChange[] => {
  const pendingChanges: PendingChange[] = [];

  const fileBlocks = modifications
    .split(/\bFILE:\s*/i)
    .filter((b) => b.trim().length > 0);

  // Group blocks by file to avoid multiple PendingChange objects for the same file
  const blocksByFile: Record<string, string[]> = {};
  for (const block of fileBlocks) {
    const blockLines = block.split(/\r?\n/);
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

    // Try to find the file if the path provided by LLM is incomplete
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
    const changes: { line: number; remove?: string; add?: string }[] = [];

    for (const block of blocks) {
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
          changes.push({
            line: lineNum,
            remove: removeMatch?.[1]?.trimEnd(),
            add: addMatch?.[1]?.trimEnd(),
          });
        }
      }
    }

    // Sort all changes for this file ascending
    changes.sort((a, b) => a.line - b.line);

    let currentOffset = 0;
    for (const change of changes) {
      let expectedIndex = change.line - 1 + currentOffset;
      if (expectedIndex < 0) expectedIndex = 0;
      if (expectedIndex > contentLines.length)
        expectedIndex = contentLines.length;

      let foundIndex = -1;
      let removeLines: string[] = [];

      if (change.remove) {
        removeLines = change.remove.split(/\r?\n/);

        // 1. Precise Check + Neighbors (+/- 5 lines)
        const searchOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
        for (const offset of searchOffsets) {
          const checkIndex = expectedIndex + offset;
          if (
            checkIndex < 0 ||
            checkIndex + removeLines.length > contentLines.length
          )
            continue;

          let match = true;
          for (let i = 0; i < removeLines.length; i++) {
            if (
              contentLines[checkIndex + i]?.trim() !== removeLines[i]?.trim()
            ) {
              match = false;
              break;
            }
          }
          if (match) {
            foundIndex = checkIndex;
            if (offset !== 0) currentOffset += offset;
            break;
          }
        }

        // 2. Global Search if fuzzy fails
        if (foundIndex === -1) {
          for (let i = 0; i <= contentLines.length - removeLines.length; i++) {
            let match = true;
            for (let j = 0; j < removeLines.length; j++) {
              if (contentLines[i + j]?.trim() !== removeLines[j]?.trim()) {
                match = false;
                break;
              }
            }
            if (match) {
              // If multiple matches, we could try to find the "closest" but for now let's take the first one
              // and update our offset relative to the expected position
              foundIndex = i;
              // Adjust offset so that (line - 1 + offset) points to the found index
              currentOffset = foundIndex - (change.line - 1);
              break;
            }
          }
        }

        if (foundIndex === -1) {
          updateOutput(
            "log",
            `[applyTargetedChanges] FAILED to remove lines at ${change.line} in ${filePath} due to mismatch`
          );
          continue;
        }

        contentLines.splice(foundIndex, removeLines.length);
        currentOffset -= removeLines.length;
      } else {
        foundIndex = expectedIndex;
      }

      if (change.add) {
        const addLines = change.add.split(/\r?\n/);
        contentLines.splice(foundIndex, 0, ...addLines);
        currentOffset += addLines.length;
      }
    }

    const newContent = contentLines.join("\n");
    pendingChanges.push({
      filePath,
      absPath,
      oldContent,
      newContent,
    });
  }

  return pendingChanges;

  return pendingChanges;
};
