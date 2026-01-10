/**
 * Command Registry
 * Defines all available CLI commands with descriptions and usage information.
 */

export interface CommandDefinition {
  name: string;
  description: string;
  subcommands?: CommandDefinition[];
  usage?: string;
  fullPath?: string; // Full command path for display (e.g., "/model list")
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
      {
        name: "auth",
        description: "Set OpenRouter API key",
        usage: "/openrouter auth <api-key>",
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
    subcommands: [
      {
        name: "add",
        description: "Add a Groq model",
        usage: "/groq add <model-id>",
      },
      {
        name: "auth",
        description: "Set Groq API key",
        usage: "/groq auth <api-key>",
      },
    ],
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

/**
 * Template for autocomplete dropdown display
 */
export interface CommandTemplate {
  template: string;
  description: string;
}

/**
 * Get all command templates for autocomplete dropdown.
 * Uses the usage field as template, falls back to constructing from name.
 */
export function getCommandTemplates(): CommandTemplate[] {
  const templates: CommandTemplate[] = [];

  for (const cmd of COMMANDS) {
    // Add the base command
    templates.push({
      template: cmd.usage || `/${cmd.name}`,
      description: cmd.description,
    });

    // Add subcommands
    if (cmd.subcommands) {
      for (const sub of cmd.subcommands) {
        templates.push({
          template: sub.usage || `/${cmd.name} ${sub.name}`,
          description: sub.description,
        });
      }
    }
  }

  return templates;
}

/**
 * Get prefixes that indicate a more specific command is being typed.
 * Used to hide generic "/model <model-name>" when user types "/model all" etc.
 */
export function getSpecificModelPrefixes(): string[] {
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

/**
 * Check if a command template expects a model name argument.
 */
export function templateExpectsModelName(template: string): boolean {
  return template.includes("<model-name>");
}
