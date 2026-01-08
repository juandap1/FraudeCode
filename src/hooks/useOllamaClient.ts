import { useCallback, useRef, useState } from "react";

import type { PendingChange } from "../types/state";

import { createModifyProjectTool } from "../core/tools/ModifyProjectTool";
import { createSummarizeProjectTool } from "../core/tools/SummarizeProjectTool";
import { createRouterGraph } from "../core/agent/router";
import { HumanMessage } from "@langchain/core/messages";
import {
  useFraudeStore,
  useInteraction,
  initSignal,
  getSignal,
} from "../store/useFraudeStore";
import log from "../utils/logger";
import { openRouterCommandHandler } from "../services/openrouter";
import { getCommandHelp } from "../core/commands";
import { useSettingsStore } from "../store/settingsStore";
import { Settings } from "../utils/Settings";

export interface OllamaCLI {
  handleQuery: (query: string) => Promise<void>;
  pendingChanges: PendingChange[];
  interactionId: string | null;
}

export function useOllamaClient(initialId: string | null = null): OllamaCLI {
  const [interactionId, setInteractionId] = useState<string | null>(initialId);
  const {
    addInteraction,
    updateInteraction,
    updateOutput,
    setError,
    promptUserConfirmation,
  } = useFraudeStore();

  const interaction = useInteraction(interactionId);

  const handleQuery = useCallback(
    async (query: string) => {
      try {
        const id = useFraudeStore.getState().currentInteractionId;
        if (!id) {
          throw new Error("No interaction ID");
        }
        updateOutput("command", query);

        if (query.startsWith("/")) {
          await commandHandler(query);
          updateOutput("settings", query);
          updateInteraction(id, { status: 2 });
          return;
        }

        updateInteraction(id, { status: 1 });

        initSignal();

        const tools = [
          createModifyProjectTool(promptUserConfirmation),
          createSummarizeProjectTool(),
        ];

        const router = createRouterGraph(tools);

        await router.invoke(
          { messages: [new HumanMessage(query)] },
          {
            configurable: { thread_id: id },
            signal: getSignal(),
          }
        );

        updateInteraction(id, { status: 2 });
      } catch (error: any) {
        if (error.name !== "AbortError") {
          setError(error);
        }
      }
    },
    [addInteraction, updateInteraction]
  );

  const commandHandler = (query: string) => {
    const { updateOutput } = useFraudeStore.getState();
    let command = query.slice(1).split(" ");
    const base = command.shift();
    switch (base) {
      case "help":
        const helpText = getCommandHelp(command[0]);
        updateOutput("log", helpText);
        break;
      case "model":
        handleModelCommand(command);
        break;
      case "openrouter":
        openRouterCommandHandler(command);
        break;
      case "ollama":
        break;
      case "groq":
        break;

      default:
        updateOutput(
          "log",
          `Unknown command: /${base}. Type /help for available commands.`
        );
        break;
    }
  };

  const handleModelCommand = (args: string[]) => {
    const { updateOutput } = useFraudeStore.getState();
    const store = useSettingsStore.getState();
    const settings = Settings.getInstance();
    const models = settings.get("models");

    const subcommand = args[0]?.toLowerCase() ?? "";

    // /model list - show current assignments
    if (subcommand === "list" || args.length === 0) {
      const output = `
Current Model Assignments:
  Reasoning (R): ${store.thinkerModel}
  General (G):   ${store.generalModel}
  Light (L):     ${store.scoutModel}

Usage:
  /model <name>              Set model for all roles
  /model <name> <role>       Set model for specific role
  /model all <name>          Set model for all roles
  /model reasoning <name>    Set reasoning model
  /model general <name>      Set general model
  /model light <name>        Set light-weight model

Roles: r|reasoning, g|general, l|light, a|all`;
      updateOutput("log", output);
      return;
    }

    // Role aliases
    const roleAliases: Record<string, string> = {
      r: "reasoning",
      reasoning: "reasoning",
      g: "general",
      general: "general",
      l: "light",
      light: "light",
      a: "all",
      all: "all",
    };

    // Check if first arg is a role command (list, all, reasoning, general, light)
    const roleCommands = [
      "list",
      "all",
      "reasoning",
      "general",
      "light",
      "r",
      "g",
      "l",
      "a",
    ];

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
        // No role specified, set all
        role = "all";
        modelName = args.join(" ");
      }
    }

    if (!modelName) {
      updateOutput(
        "log",
        "Error: No model name specified. Use /model list to see current assignments."
      );
      return;
    }

    // Find matching model (partial match)
    const matchedModel = models.find((m) =>
      m.name.toLowerCase().includes(modelName.toLowerCase())
    );

    const finalModelName = matchedModel?.name || modelName;

    // Apply changes based on role
    const setModel = (setter: (model: string) => void, roleName: string) => {
      setter(finalModelName);
      return roleName;
    };

    const changedRoles: string[] = [];

    switch (role) {
      case "all":
        changedRoles.push(setModel(store.setThinkerModel, "Reasoning"));
        changedRoles.push(setModel(store.setGeneralModel, "General"));
        changedRoles.push(setModel(store.setScoutModel, "Light"));
        break;
      case "reasoning":
        changedRoles.push(setModel(store.setThinkerModel, "Reasoning"));
        break;
      case "general":
        changedRoles.push(setModel(store.setGeneralModel, "General"));
        break;
      case "light":
        changedRoles.push(setModel(store.setScoutModel, "Light"));
        break;
      default:
        updateOutput(
          "log",
          `Unknown role: ${role}. Use: r|reasoning, g|general, l|light, a|all`
        );
        return;
    }

    const matchNote = matchedModel
      ? ""
      : " (model not found in registry, using as-is)";
    updateOutput(
      "log",
      `✓ Set ${changedRoles.join(", ")} model to: ${finalModelName}${matchNote}`
    );
  };

  return {
    handleQuery,
    pendingChanges: interaction?.pendingChanges || [],
    interactionId,
  };
}

export default useOllamaClient;
