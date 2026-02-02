import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import { projectPath } from "@/utils";
import pendingChanges from "@/agent/pendingChanges";

import DESCRIPTION from "./descriptions/write.txt" with { type: "text" };
const { updateOutput } = useFraudeStore.getState();

const writeTool = tool({
  description: DESCRIPTION,
  strict: true,
  inputSchema: z.object({
    path: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  execute: async ({ path, content }) => {
    const change = await pendingChanges.addChange(path, content, "write");
    const stats = pendingChanges.getDiffStats(change.diff);
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Created File",
        details: path,
        result: `(+${stats.added} / -${stats.removed})`,
      }),
      { dontOverride: true },
    );
    return { success: true };
  },
});

export default writeTool;
