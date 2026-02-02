import { BunApiRouter } from "@/utils/router";
import type { Command } from "@/types/CommandDefinition";
import log from "@/utils/logger";
import useFraudeStore from "@/store/useFraudeStore";

const command: Command = {
  name: "serve",
  description: "Starts server to serve registered endpoints",
  usage: "/serve <port>",
  action: async (args: string[]) => {
    const port = args[0] ? parseInt(args[0], 10) : 3000;

    if (isNaN(port)) {
      useFraudeStore.getState().updateOutput("error", "Invalid port number");
      return;
    }

    log(`Starting server on port ${port}...`);
    try {
      await BunApiRouter.shared.serve(port);
      log("Server stopped.");
    } catch (error) {
      log("Server error:", error);
      useFraudeStore
        .getState()
        .updateOutput("error", `Server failed: ${error}`);
    }
  },
};

export default command;
