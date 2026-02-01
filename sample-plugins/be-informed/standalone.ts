import plugin from "./index";
import { BunApiRouter } from "@/utils/router";
import Agent from "@/agent/agent";
import { Settings, UpdateSettings } from "@/config/settings";
import log from "@/utils/logger";
import type { PluginContext } from "@/types/PluginContext";

console.log("Starting informed plugin standalone server...");

const mockContext: PluginContext = {
  log,
  Router: BunApiRouter,
  Agent,
  settings: {
    get: (key: string) => Settings.getInstance().get(key as any),
    getAll: () => Settings.getInstance().getAll(),
    update: async (updates: any) => {
      await UpdateSettings(updates);
    },
  },
  ui: {
    updateOutput: (type, content) => console.log(`[${type}] ${content}`),
  },
  utils: {},
};

const run = async () => {
  const commandOrCommands = await plugin(mockContext);
  const command = Array.isArray(commandOrCommands)
    ? commandOrCommands[0]
    : commandOrCommands;

  if (!command) {
    console.error("No command returned from plugin");
    process.exit(1);
  }

  const startCmd = command.subcommands?.find((c) => c.name === "start");
  if (startCmd?.action) {
    await startCmd.action([]);
  } else {
    console.error("Could not find start command action");
    process.exit(1);
  }
};

run().catch((err) => {
  console.error("Error starting server:", err);
  process.exit(1);
});
