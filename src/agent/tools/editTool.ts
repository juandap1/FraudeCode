import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import { projectPath } from "@/utils";
import pendingChanges from "@/agent/pendingChanges";

import DESCRIPTION from "./descriptions/edit.txt" with { type: "text" };
const { updateOutput } = useFraudeStore.getState();

const editTool = tool({
  description: DESCRIPTION,
  strict: true,
  inputSchema: z.object({
    path: z.string().describe("The path to the file to edit"),
    old_content: z
      .string()
      .describe(
        "Must be unique and match the file exactly (whitespace matters)",
      ),
    new_content: z.string().describe("The new content of the file"),
  }),
  execute: async ({ path, old_content, new_content }) => {
    const fileContent = await pendingChanges.getLatestContent(path);
    if (!fileContent.includes(old_content)) {
      throw new Error("Old content does not match file");
    }
    const newFileContent = fileContent.replace(old_content, new_content);

    const change = await pendingChanges.addChange(path, newFileContent, "edit");
    const stats = pendingChanges.getDiffStats(change.diff);
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Edited File",
        details: path,
        result: `(+${stats.added} / -${stats.removed})`,
      }),
      { dontOverride: true },
    );
    return { success: true };
  },
});

export default editTool;
