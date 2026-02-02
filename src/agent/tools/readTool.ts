import { tool } from "ai";
import { z } from "zod";
import path from "path";
import { projectPath } from "@/utils";
import useFraudeStore from "@/store/useFraudeStore";
import pendingChanges from "@/agent/pendingChanges";
import DESCRIPTION from "./descriptions/read.txt" with { type: "text" };

const { updateOutput } = useFraudeStore.getState();

const readTool = tool({
  description: DESCRIPTION,
  strict: true,
  inputSchema: z.object({
    filePath: z
      .string()
      .describe("The path to the file to read. Base path is the project root."),
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
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(process.cwd(), filePath);
    }
    const file = Bun.file(filePath);
    const isStaged = pendingChanges
      .getChanges()
      .some((c) => c.path === filePath);
    if (!isStaged && !(await file.exists())) {
      updateOutput(
        "toolCall",
        JSON.stringify({
          action: "Error Reading " + projectPath(filePath),
          details: "File doesn't exist",
          result: "",
        }),
        { dontOverride: true },
      );
      throw new Error("File doesn't exist");
    }
    const text = await pendingChanges.getLatestContent(filePath);
    const lines = text.split("\n");
    const lastLine = Math.min(offset + limit, lines.length);
    const result = lines.slice(offset, lastLine).join("\n");
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Analyzing " + projectPath(filePath),
        details: "#L" + (offset + 1) + "-" + lastLine,
        result: result,
      }),
      { dontOverride: true },
    );
    if (text.trim() === "") {
      throw new Error("File is empty");
    }
    return {
      result,
      lastLine,
    };
  },
});

export default readTool;
