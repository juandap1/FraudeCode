import type { CommandDefinition } from "@/types/CommandDefinition";
import ModelCommandCenter from "./models";
import COMMANDS from "./COMMANDS";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

// Class for handling commands
class CommandCenter {
  processCommand = async (query: string) => {
    let command = query.slice(1).split(" ");
    const base = command.shift();
    switch (base) {
      case "help":
        break;
      case "context":
        updateOutput("settings", "/context");
        break;
      case "model":
      case "openrouter":
      case "ollama":
      case "groq":
      case "models":
        await ModelCommandCenter.processCommand(query);
        break;
      default:
        // updateOutput(
        //   "log",
        //   `Unknown command: /${base}. Type /help for available commands.`
        // );
        break;
    }
  };

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

  getAllCommands(): CommandDefinition[] {
    const templates: CommandDefinition[] = [];

    for (const cmd of COMMANDS) {
      // Add subcommands
      if (cmd.subcommands) {
        for (const sub of cmd.subcommands) {
          templates.push(sub);
        }
      } else if (!cmd.usage.includes("<subcommand>")) {
        templates.push(cmd);
      }
    }

    return templates;
  }
}

export default new CommandCenter();
