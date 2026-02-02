import { readdir } from "node:fs/promises";
import path from "node:path";

export interface FileSuggestion {
  path: string;
  type: "file" | "dir";
  childCount?: number;
}

// Cache for file list to avoid re-scanning on every keystroke
let fileCache: FileSuggestion[] | null = null;
let lastScanTime = 0;
const SCAN_INTERVAL = 10000; // 10 seconds
const MAX_FILES = 50000; // Increased limit for large repos

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  ".bun",
  "coverage",
  "build",
  ".cache",
]);

export async function getFileSuggestions(
  cwd: string,
): Promise<FileSuggestion[]> {
  const now = Date.now();
  if (fileCache && now - lastScanTime < SCAN_INTERVAL) {
    return fileCache;
  }

  const results: FileSuggestion[] = [];

  try {
    await scanDirectory(cwd, "", results);
    fileCache = results;
    lastScanTime = now;
    return results;
  } catch (error) {
    console.error("Error scanning files:", error);
    return [];
  }
}

// Returns the number of items in the directory scanned
async function scanDirectory(
  basePath: string,
  relativePath: string,
  results: FileSuggestion[],
): Promise<number> {
  if (results.length >= MAX_FILES) return 0;

  const currentDir = path.join(basePath, relativePath);

  try {
    const entries = await readdir(currentDir, { withFileTypes: true });

    // Filter out ignored items immediately
    const validEntries = entries.filter(
      (entry) => !IGNORED_DIRS.has(entry.name),
    );

    for (const entry of validEntries) {
      if (results.length >= MAX_FILES) break;

      const entryName = entry.name;
      const entryRelativePath = relativePath
        ? path.join(relativePath, entryName)
        : entryName;

      if (entry.isDirectory()) {
        const suggestion: FileSuggestion = {
          path: entryRelativePath,
          type: "dir",
          childCount: 0, // Will be updated after recursion
        };
        results.push(suggestion);

        // Recursively scan and get the count
        const count = await scanDirectory(basePath, entryRelativePath, results);
        suggestion.childCount = count;
      } else {
        results.push({
          path: entryRelativePath,
          type: "file",
        });
      }
    }

    return validEntries.length;
  } catch (err) {
    // Permission denied or other error
    return 0;
  }
}

export function filterFiles(
  files: FileSuggestion[],
  input: string,
): FileSuggestion[] {
  if (!input) return [];

  // Input might be "@src/u" -> we want to match "src/utils"
  const query = input.startsWith("@") ? input.slice(1) : input;
  const lowerQuery = query.toLowerCase();

  return files.filter((f) => f.path.toLowerCase().includes(lowerQuery));
}
