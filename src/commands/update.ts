import type { Command } from "@/types/CommandDefinition";
import { version } from "../../package.json";
import { checkForUpdate } from "../utils/updateCheck";
import useFraudeStore from "@/store/useFraudeStore";
const { updateOutput } = useFraudeStore.getState();

const updateCommand: Command = {
  name: "update",
  description: "Check for the latest version of FraudeCode",
  usage: "/update",
  action: async () => {
    updateOutput("log", "Checking for updates...");
    const latest = await checkForUpdate(version);

    if (!latest) {
      updateOutput(
        "log",
        "🎉 You are already using the latest version of FraudeCode (v" +
          version +
          ").",
      );
      return;
    }

    updateOutput(
      "log",
      "🚀 A new version of FraudeCode is available: v" + latest,
    );
    updateOutput("log", "-----------------------------------------");
    updateOutput("log", "To update to the latest version, run:");
    updateOutput("log", "  npm install -g fraude-code");
    updateOutput("log", "-----------------------------------------");
  },
};

export default updateCommand;
