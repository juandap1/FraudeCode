import fs from "fs";
import path from "path";
import type { Command } from "@/types/CommandDefinition";
import { getLogPath } from "@/utils/logger";
import useFraudeStore from "@/store/useFraudeStore";

const logCommand: Command = {
  name: "log",
  description: "Save log for current session to local directory",
  usage: "/log",
  action: async () => {
    const { updateOutput } = useFraudeStore.getState();
    try {
      const sourcePath = getLogPath();
      const destPath = path.join(process.cwd(), "debug.log");

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        updateOutput(
          "log",
          `Debug log for current session written to ${destPath}`,
        );
      } else {
        updateOutput("log", "No debug log found.");
      }
    } catch (error) {
      updateOutput("error", `Error writing debug log: ${error}`);
    }
  },
};

export default logCommand;
