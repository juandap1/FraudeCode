import type { PluginContext } from "@/types/PluginContext";
import type { Command } from "@/types/CommandDefinition";

export default async (context: PluginContext): Promise<Command> => {
  const { log, ui } = context;

  return {
    name: "context-demo",
    description: "Demonstrates dependency injection",
    usage: "/context-demo",
    action: async (args: string[]) => {
      log("Context demo running!");
      ui.updateOutput(
        "markdown",
        "# Hello from Context Plugin!\n\nThis plugin does not use fragile imports.",
      );
    },
  };
};
