import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import DESCRIPTION from "./descriptions/glob.txt" with { type: "text" };
import { Glob } from "bun";

const { updateOutput } = useFraudeStore.getState();

const globTool = tool({
  description: DESCRIPTION,
  strict: true,
  inputSchema: z.object({
    pattern: z.string().describe("The glob pattern to match files with"),
    path: z
      .string()
      .optional()
      .describe(
        `The directory to search in. If not specified, the current directory will be searched. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.`,
      ),
  }),
  execute: async ({ pattern, path }: { pattern: string; path?: string }) => {
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Searching Files in " + path,
        details: pattern,
      }),
      { dontOverride: true },
    );
    const searchPath = path || process.cwd();
    const glob = new Glob(pattern);
    const files: { file: string; modifiedAt: number }[] = [];
    const MAX_FILES = 100;
    for await (const file of glob.scan({ cwd: searchPath, absolute: false })) {
      if (file.includes("node_modules") || file.includes(".git")) continue;
      const f = Bun.file(file);
      const stats = await f.stat().catch(() => null);
      const modifiedAt = stats?.mtime.getTime() || 0;
      files.push({ file, modifiedAt });
      if (files.length >= MAX_FILES) {
        break;
      }
    }
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Found " + files.length + " Files",
        details: pattern,
      }),
    );
    if (files.length === 0) return "No files found matching that pattern.";
    return files
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .map((f) => f.file)
      .join("\n");
  },
});

export default globTool;
