import type { CommandDefinition } from "./types/CommandDefinition";
import ModelCommandCenter from "./models";
import COMMANDS from "./COMMANDS";

// Class for handling commands
class CommandCenter {
  processCommand = async (query: string) => {
    let command = query.slice(1).split(" ");
    const base = command.shift();
    switch (base) {
      case "help":
        break;
      case "model":
      case "openrouter":
      case "ollama":
      case "groq":
      case "models":
        ModelCommandCenter.processCommand(query);
        break;
      default:
        // updateOutput(
        //   "log",
        //   `Unknown command: /${base}. Type /help for available commands.`
        // );
        break;
    }
  };

  // Get commands that match the current input.
  // Supports matching base commands and subcommands.
  getMatchingCommands(input: string): CommandDefinition[] {
    if (!input.startsWith("/")) return [];

    const parts = input.slice(1).toLowerCase().split(" ");
    const baseInput = parts[0] || "";

    // If there's a space, we're looking for subcommands only
    if (parts.length > 1 && parts[0]) {
      const baseCommand = COMMANDS.find(
        (cmd) => cmd.name.toLowerCase() === parts[0]
      );
      if (baseCommand?.subcommands) {
        const subInput = parts[1] || "";
        return baseCommand.subcommands
          .filter((sub) => sub.name.toLowerCase().startsWith(subInput))
          .map((sub) => ({
            ...sub,
            fullPath: `/${baseCommand.name} ${sub.name}`,
          }));
      }
      return [];
    }

    // Match base commands AND their subcommands (main commands first)
    const mainCommands: CommandDefinition[] = [];
    const subCommands: CommandDefinition[] = [];

    for (const cmd of COMMANDS) {
      if (cmd.name.toLowerCase().startsWith(baseInput)) {
        // Add the base command
        mainCommands.push({ ...cmd, fullPath: `/${cmd.name}` });

        // Collect subcommands separately
        if (cmd.subcommands) {
          for (const sub of cmd.subcommands) {
            subCommands.push({
              ...sub,
              fullPath: `/${cmd.name} ${sub.name}`,
            });
          }
        }
      }
    }

    return [...mainCommands, ...subCommands];
  }

  // Get help text for commands.
  getCommandHelp(commandName?: string): string {
    if (commandName) {
      const cmd = COMMANDS.find(
        (c) => c.name.toLowerCase() === commandName.toLowerCase()
      );
      if (cmd) {
        let help = `\n/${cmd.name} - ${cmd.description}\n`;
        if (cmd.usage) {
          help += `  Usage: ${cmd.usage}\n`;
        }
        if (cmd.subcommands && cmd.subcommands.length > 0) {
          help += `  Subcommands:\n`;
          for (const sub of cmd.subcommands) {
            help += `    ${sub.name} - ${sub.description}\n`;
            if (sub.usage) {
              help += `      Usage: ${sub.usage}\n`;
            }
          }
        }
        return help;
      }
      return `Unknown command: ${commandName}. Type /help for available commands.`;
    }

    // General help
    let help = "\nAvailable Commands:\n";
    for (const cmd of COMMANDS) {
      help += `  /${cmd.name} - ${cmd.description}\n`;
    }
    help += "\nType /help <command> for detailed usage.";
    return help;
  }

  // Get prefixes that indicate a more specific command is being typed.
  // Used to hide generic "/model <model-name>" when user types "/model all" etc.
  getSpecificModelPrefixes(): string[] {
    const prefixes: string[] = [];

    const modelCmd = COMMANDS.find((c) => c.name === "model");
    if (modelCmd?.subcommands) {
      for (const sub of modelCmd.subcommands) {
        prefixes.push(`/model ${sub.name}`);
        // Add single-letter alias if applicable
        if (sub.name.length > 1) {
          prefixes.push(`/model ${sub.name[0]}`);
        }
      }
    }

    return prefixes;
  }

  // Check if a command template expects a model name argument.
  templateExpectsModelName(template: string): boolean {
    return template.includes("<model-name>");
  }
}
