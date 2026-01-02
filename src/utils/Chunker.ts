import type { Chunk } from "../types/analysis";

const MAX_TOKENS = 8192;

export async function split(src: string, startLine: number): Promise<Chunk[]> {
  if (!src.trim()) return [];
  const lines = src.split("\n");

  // Trim trailing empty lines from the source lines
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }

  // Trim leading empty lines
  let leadingEmptyCount = 0;
  while (lines.length > 0 && lines[0]?.trim() === "") {
    lines.shift();
    leadingEmptyCount++;
  }

  if (lines.length === 0) return [];

  const NEW_LINE_TOKEN = "\n";
  let currentLines: string[] = [];
  let currentTokens = 0;
  // Adjust startLine by the number of removed leading lines
  let splitStart = startLine + leadingEmptyCount;
  const splits: Chunk[] = [];

  const flush = () => {
    splits.push({
      id: crypto.randomUUID(),
      document: currentLines.join("\n"),
      startLine: splitStart,
      endLine: splitStart + currentLines.length - 1,
    });
  };

  for (const line of lines) {
    const lineTokens = line.length + NEW_LINE_TOKEN.length;
    if (currentTokens + lineTokens > MAX_TOKENS && currentLines.length > 0) {
      flush();
      splitStart += currentLines.length;
      currentLines = [];
      currentTokens = 0;
    }
    currentLines.push(line);
    currentTokens += lineTokens;
  }
  if (currentLines.length > 0) flush();
  return splits;
}
