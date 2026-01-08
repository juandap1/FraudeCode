/**
 * Command Registry
 * Defines all available CLI commands with descriptions and usage information.
 */

export interface CommandDefinition {
  name: string;
  description: string;
  subcommands?: CommandDefinition[];
  usage?: string;
}

export const COMMANDS: CommandDefinition[] = [
  {
    name: "help",
    description: "Show available commands and usage",
    usage: "/help [command]",
  },
  {
    name: "models",
    description: "List available models",
    usage: "/models",
  },
  {
    name: "usage",
    description: "Show usage information",
    usage: "/usage",
  },
  {
    name: "model",
    description: "Set active model(s) by role",
    usage: "/model <model-name> [role]",
    subcommands: [
      {
        name: "list",
        description: "Show current model assignments",
        usage: "/model list",
      },
      {
        name: "all",
        description: "Set model for all roles",
        usage: "/model all <model-name>",
      },
      {
        name: "reasoning",
        description: "Set reasoning/thinker model",
        usage: "/model reasoning <model-name>",
      },
      {
        name: "general",
        description: "Set general purpose model",
        usage: "/model general <model-name>",
      },
      {
        name: "light",
        description: "Set light-weight/scout model",
        usage: "/model light <model-name>",
      },
    ],
  },
  {
    name: "openrouter",
    description: "Manage OpenRouter models",
    usage: "/openrouter <subcommand>",
    subcommands: [
      {
        name: "add",
        description: "Add an OpenRouter model",
        usage: "/openrouter add <model-id>",
      },
    ],
  },
  {
    name: "ollama",
    description: "Manage Ollama models",
    usage: "/ollama <subcommand>",
    subcommands: [],
  },
  {
    name: "groq",
    description: "Manage Groq models",
    usage: "/groq <subcommand>",
    subcommands: [],
  },
];

/**
 * Get commands that match the current input.
 * Supports matching base commands and subcommands.
 *
 * @param input - The current input string (should start with "/")
 * @returns Array of matching command definitions
 */
export function getMatchingCommands(input: string): CommandDefinition[] {
  if (!input.startsWith("/")) return [];

  const parts = input.slice(1).toLowerCase().split(" ");
  const baseInput = parts[0] || "";

  // If there's a space, we're looking for subcommands
  if (parts.length > 1 && parts[0]) {
    const baseCommand = COMMANDS.find(
      (cmd) => cmd.name.toLowerCase() === parts[0]
    );
    if (baseCommand?.subcommands) {
      const subInput = parts[1] || "";
      return baseCommand.subcommands.filter((sub) =>
        sub.name.toLowerCase().startsWith(subInput)
      );
    }
    return [];
  }

  // Match base commands
  return COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(baseInput));
}

/**
 * Get help text for commands.
 *
 * @param commandName - Optional specific command to get help for
 * @returns Formatted help text string
 */
export function getCommandHelp(commandName?: string): string {
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
