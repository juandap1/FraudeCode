import { ChatOpenAI } from "@langchain/openai";
import useSettingsStore from "../store/useSettingsStore";

interface ModelConfig {
  provider: "groq" | "openrouter" | "ollama";
  modelName: string;
  temperature?: number;
}

const getSettings = () => useSettingsStore.getState();

function llmClient(config: ModelConfig) {
  const providerConfigs = {
    groq: {
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: getSettings().groq_api_key,
    },
    openrouter: {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: getSettings().openrouter_api_key,
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
   * Returns an LLM client for a specific model.
   */
  getClient(modelName: string): ReturnType<typeof llmClient> {
    const provider = getProviderForModel(modelName);
    return llmClient({
      provider,
      modelName,
      temperature: 0.7,
    });
  }

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
}

/** Singleton instance of LLMService for convenience */
export const llm = new LLMService();
