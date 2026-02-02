import type { PluginContext } from "@/types/PluginContext";
import type { Command } from "@/types/CommandDefinition";

export default async (context: PluginContext): Promise<Command> => {
  const { log } = context;

  return {
    name: "hello-plugin",
    description: "A sample plugin command",
    usage: "/hello-plugin <name>",
    action: async (args: string[]) => {
      log("Hello from plugin! Args:", args.join(", "));
    },
  };
};
