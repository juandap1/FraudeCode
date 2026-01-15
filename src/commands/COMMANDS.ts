import type { CommandDefinition } from "../types/CommandDefinition";

const COMMANDS: CommandDefinition[] = [
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
        description: "Set lightweight model",
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

export default COMMANDS;
