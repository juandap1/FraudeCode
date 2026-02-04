import type { Command } from "@/types/CommandDefinition";
import useSettingsStore from "@/store/useSettingsStore";
import { UpdateSettings } from "@/config/settings";
import {
  parseModelDisplayId,
  getModelDisplayId,
  getModelUniqueId,
} from "@/types/Model";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const setModel = async (args: string[]) => {
  const store = useSettingsStore.getState();
  const models = store.models;

  const subcommand = args[0]?.toLowerCase() ?? "";

  // Role aliases
  const roleAliases: Record<string, string> = {
    p: "primary",
    primary: "primary",
    s: "secondary",
    secondary: "secondary",
    a: "all",
    all: "all",
  };

  // Check if first arg is a role command
  const roleCommands = ["all", "primary", "secondary", "p", "s", "a"];

  let modelName: string;
  let role: string;

  if (subcommand && roleCommands.includes(subcommand)) {
    // Format: /model <role> <model-name>
    role = roleAliases[subcommand] ?? subcommand;
    modelName = args.slice(1).join(" ");
  } else {
    // Format: /model <model-name> [role]
    // Check if last arg is a role
    const lastArg = args[args.length - 1]?.toLowerCase() ?? "";
    if (args.length > 1 && lastArg && roleAliases[lastArg]) {
      role = roleAliases[lastArg];
      modelName = args.slice(0, -1).join(" ");
    } else {
      role = "all";
      modelName = args.join(" ");
    }
  }
  if (!modelName) {
    updateOutput(
      "log",
      "Error: No model name specified. Use /model list to see current assignments.",
    );
    return;
  }

  // Try to parse as display ID (e.g., "model-name (provider)")
  const parsed = parseModelDisplayId(modelName);
  let matchedModel;

  if (parsed) {
    // Match by both name and provider type
    matchedModel = models.find(
      (m) =>
        m.name.toLowerCase() === parsed.name.toLowerCase() &&
        m.type === parsed.type,
    );
  } else {
    // Fall back to name-only matching (for backwards compatibility)
    // If multiple models have the same name, this picks the first one
    matchedModel = models.find(
      (m) => m.name.toLowerCase() === modelName.toLowerCase(),
    );
  }

  if (!matchedModel) {
    updateOutput(
      "error",
      `Error: Model "${modelName}" not found. Use /model list to see available models.`,
    );
    return;
  }

  // Use unique ID (name|type) for storage to distinguish same-named models
  const finalModelName = getModelUniqueId(matchedModel);
  const displayName = getModelDisplayId(matchedModel);
  const changedRoles: string[] =
    role === "all" ? ["primary", "secondary"] : [role];
  const updates: Record<string, string> = {};

  switch (role) {
    case "all":
      updates.primaryModel = finalModelName;
      updates.secondaryModel = finalModelName;
      break;
    case "primary":
      updates.primaryModel = finalModelName;
      break;
    case "secondary":
      updates.secondaryModel = finalModelName;
      break;
    default:
      updateOutput(
        "log",
        `Unknown role: ${role}. Use: p|primary, s|secondary, a|all`,
      );
      return;
  }

  // Single write for all updates
  await UpdateSettings(updates);

  updateOutput(
    "log",
    `✓ Set ${changedRoles.join(", ")} model to: ${displayName}`,
  );
};

const modelSetCommands: Command = {
  name: "model",
  description: "Set active model(s) by role",
  usage: "/model <model-name> <role>",
  action: setModel,
  subcommands: [
    {
      name: "all",
      description: "Set model for all roles",
      usage: "/model all <model-name>",
    },
    {
      name: "primary",
      description: "Set primary model",
      usage: "/model primary <model-name>",
    },
    {
      name: "secondary",
      description: "Set secondary model",
      usage: "/model secondary <model-name>",
    },
  ],
};

export default modelSetCommands;
