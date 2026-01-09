import { ChatOpenAI } from "@langchain/openai";
import { Settings, UpdateSettings, type Model } from "../utils/Settings";
import { useSettingsStore } from "../store/settingsStore";

interface ModelConfig {
  provider: "groq" | "openrouter" | "ollama";
  modelName: string;
  temperature?: number;
}

// Helper to get state non-reactively (outside components)
const getSettings = () => useSettingsStore.getState();

function llmClient(config: ModelConfig) {
  const providerConfigs = {
    groq: {
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
    },
    openrouter: {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    },
    ollama: {
      baseURL: "http://localhost:11434/v1", // Note the /v1 for compatibility
      apiKey: "ollama", // Placeholder, Ollama doesn't require one
    },
  };

  const settings = providerConfigs[config.provider];

  return new ChatOpenAI({
    modelName: config.modelName,
    temperature: config.temperature ?? 0.7,
    apiKey: settings.apiKey,
    configuration: {
      baseURL: settings.baseURL,
    },
  });
}

// =============================================================================
// LLMService Class
// =============================================================================

/**
 * Looks up the provider type for a model from the settings models array.
 * Falls back to "ollama" if the model is not found.
 */
const getProviderForModel = (
  modelName: string
): "groq" | "openrouter" | "ollama" => {
  const { models } = getSettings();
  const model = models.find((m) => m.name === modelName);
  if (
    model?.type === "groq" ||
    model?.type === "openrouter" ||
    model?.type === "ollama"
  ) {
    return model.type;
  }
  return "ollama";
};

/**
 * Centralized LLM service for accessing models across the application.
 * Provides methods to get models based on their role (chat, think, scout).
 */
export class LLMService {
  /**
   * Returns the general/chat model configured in settings.
   * Used for standard conversational tasks and general code assistance.
   */
  chat(): ReturnType<typeof llmClient> {
    const { generalModel } = getSettings();
    return llmClient({
      provider: getProviderForModel(generalModel),
      modelName: generalModel,
      temperature: 0.7,
    });
  }

  /**
   * Returns the reasoning/thinker model configured in settings.
   * Used for complex reasoning tasks, planning, and deep analysis.
   */
  think(): ReturnType<typeof llmClient> {
    const { thinkerModel } = getSettings();
    return llmClient({
      provider: getProviderForModel(thinkerModel),
      modelName: thinkerModel,
      temperature: 0.3, // Lower temp for more focused reasoning
    });
  }

  /**
   * Returns the lightweight/scout model configured in settings.
   * Used for quick classifications, routing decisions, and lightweight tasks.
   */
  scout(): ReturnType<typeof llmClient> {
    const { scoutModel } = getSettings();
    return llmClient({
      provider: getProviderForModel(scoutModel),
      modelName: scoutModel,
      temperature: 0.1, // Very low temp for consistent classifications
    });
  }
}

/** Singleton instance of LLMService for convenience */
export const llm = new LLMService();

// =============================================================================
// Ollama Utilities
// =============================================================================

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
