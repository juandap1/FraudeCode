import { ChatOllama } from "@langchain/ollama";
import { Settings, UpdateSettings, type Model } from "../utils/Settings";
import { useSettingsStore } from "../store/settingsStore";

// Helper to get state non-reactively (outside components)
const getSettings = () => useSettingsStore.getState();

export const getThinkerModel = () => {
  const { thinkerModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: thinkerModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const getGeneralModel = () => {
  const { generalModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: generalModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const getScoutModel = () => {
  const { scoutModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: scoutModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const isOllamaHealthy = async (): Promise<boolean> => {
  try {
    const { ollamaUrl } = getSettings();
    const response = await fetch(ollamaUrl);
    const text = await response.text();
    return response.ok && text === "Ollama is running";
  } catch {
    return false;
  }
};

export const getOllamaModels = async (): Promise<Model[]> => {
  const { ollamaUrl } = getSettings();
  const response = await fetch(`${ollamaUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Error connecting to Ollama: ${response.status}`);
  }
  const data: any = await response.json();

  // Return the raw list, we'll validate/conform to schema later or rely on the basic shape
  // API returns { models: [...] }
  return data.models.map((m: any) => ({ ...m, type: "ollama" })) as Model[];
};

export const getOllamaModelDetails = async (model: string): Promise<any> => {
  const { ollamaUrl } = getSettings();
  const response = await fetch(`${ollamaUrl}/api/show`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) {
    throw new Error(`Error connecting to Ollama: ${response.status}`);
  }
  const data: any = await response.json();
  return data;
};

export const syncOllamaModels = async () => {
  try {
    const settings = Settings.getInstance();
    const savedModels = settings.get("models") || [];
    const availableModels = await getOllamaModels();

    // Preserve non-Ollama models (groq, openrouter, etc.)
    const nonOllamaModels = savedModels.filter((m) => m.type !== "ollama");

    const mergedOllamaModels: Model[] = [];

    for (const model of availableModels) {
      const existing = savedModels.find(
        (m) => m.name === model.name && m.type === "ollama"
      );
      if (existing && existing.details?.context_length) {
        mergedOllamaModels.push(existing);
        continue;
      }

      try {
        const details = await getOllamaModelDetails(model.name);
        let context_length: number | undefined;
        if (details.model_info && details.model_info["general.architecture"]) {
          const arch = details.model_info["general.architecture"];
          if (details.model_info[`${arch}.context_length`]) {
            context_length = details.model_info[`${arch}.context_length`];
          }
        }

        const enhancedModel: Model = {
          ...model,
          capabilities: details.capabilities || model.capabilities || [],
          details: {
            ...model.details,
            ...details.details,
            context_length: context_length,
          },
        };

        mergedOllamaModels.push(enhancedModel);
      } catch (err) {
        console.error(`Failed to fetch details for ${model.name}`, err);
        mergedOllamaModels.push(model);
      }
    }

    // Combine non-Ollama models with the updated Ollama models
    await UpdateSettings("models", [...nonOllamaModels, ...mergedOllamaModels]);
  } catch (error) {
    console.warn("Failed to sync Ollama models:", error);
  }
};

//https://docs.ollama.com/api/pull
