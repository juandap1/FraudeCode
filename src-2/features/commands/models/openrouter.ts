import { Settings, UpdateSettings } from "../../../config/settings";
import type { Model } from "../../../types/Model";

import useFraudeStore from "../../../store/useFraudeStore";
import OpenRouterClient from "../../../services/openrouter";

const { updateOutput } = useFraudeStore.getState();

export const openRouterCommandHandler = async (command: string[]) => {
  try {
    const base = command.shift();
    switch (base) {
      case "add":
        const model = command.shift();
        if (!model) {
          updateOutput("error", "No model specified (OpenRouter)");
          return;
        }
        await addOpenRouterModel(model);
        break;
      case "auth":
        const apiKey = command.shift();
        if (!apiKey) {
          updateOutput("error", "No API key specified (OpenRouter)");
          return;
        }
        await openRouterAuth(apiKey);
        break;
      default:
        updateOutput("error", "Unknown command (OpenRouter)");
        break;
    }
  } catch (err) {
    updateOutput("error", `${err} (OpenRouter)`);
  }
};

export const addOpenRouterModel = async (model: string) => {
  const data: any = await OpenRouterClient.getModelData(model);
  const modelData = data.data;

  if (!modelData) {
    throw new Error(`No data found for OpenRouter model ${model}`);
  }

  // Map OpenRouter data to our Model schema
  // The endpoint returns endpoints array "endpoints": [...]
  // We'll take the first endpoint or aggregate info
  const endpoint = modelData.endpoints?.[0];

  const newModel: Model = {
    type: "openrouter",
    name: modelData.id,
    modified_at: new Date(modelData.created * 1000).toISOString(),
    digest: modelData.id,
    capabilities: endpoint?.supported_parameters || [],
    usage: 0,
    details: {
      context_length: endpoint?.context_length,
    },
  };

  const settings = Settings.getInstance();
  const savedModels = settings.get("models") || [];

  // Check if model already exists, update if so, else add
  const existingIndex = savedModels.findIndex(
    (m) => m.name === newModel.name && m.type === "openrouter"
  );

  if (existingIndex >= 0) {
    savedModels[existingIndex] = newModel;
  } else {
    savedModels.push(newModel);
  }
  await UpdateSettings("models", savedModels);
  updateOutput("log", "OpenRouter model added: " + model);
};

export const openRouterAuth = async (apiKey: string) => {
  await UpdateSettings("openrouter_api_key", apiKey);
  updateOutput("log", "OpenRouter API key set");
};
