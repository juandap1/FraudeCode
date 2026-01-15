import { tool } from "ai";
import { z } from "zod";
import path from "path";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const readTool = tool({
  description: "Read a file from the file system",
  inputSchema: z.object({
    filePath: z
      .string()
      .describe(
        "The path to the file to read (relative to base directory i.e. src/index.ts)"
      ),
    offset: z.coerce
      .number()
      .describe("The line number to start reading from (0-based)")
      .optional(),
    limit: z.coerce
      .number()
      .describe("The number of lines to read (defaults to 500)")
      .optional(),
  }),
  execute: async ({
    filePath,
    offset = 0,
    limit = 500,
  }: {
    filePath: string;
    offset?: number;
    limit?: number;
  }) => {
    const absolutePath = path.resolve(process.cwd(), filePath);
    const file = Bun.file(absolutePath);
    const text = await file.text();
    const lines = text.split("\n");
    const lastLine = Math.min(offset + limit, lines.length);
    updateOutput("log", `Analyzing ${filePath}#L${offset + 1}-${lastLine}`);
    const chunk = lines.slice(offset, lastLine).join("\n");
    return {
      chunk,
      lastLine,
    };
  },
});

export default readTool;
