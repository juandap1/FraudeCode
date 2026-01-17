import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGroq } from "@ai-sdk/groq";
import { createOllama } from "ollama-ai-provider-v2";
import useSettingsStore from "@/store/useSettingsStore";
import type { ProviderType } from "@/types/Model";

const getSettings = () => useSettingsStore.getState();

const getProviderForModel = (modelName: string): ProviderType => {
  const { models } = getSettings();
  const model = models.find((m) => m.name === modelName);
  if (!model) throw new Error("Model not found");
  return model.type;
};

export function getModel(modelName: string) {
  const providerName = getProviderForModel(modelName);
  switch (providerName) {
    case "groq":
      const groq = createGroq({
        apiKey: getSettings().groq_api_key,
      });
      return groq(modelName);
    case "ollama":
      const ollama = createOllama({
        baseURL: `${getSettings().ollamaUrl}/api`,
      });
      return ollama(modelName);
    case "openrouter":
      const openrouter = createOpenRouter({
        apiKey: getSettings().openrouter_api_key,
      });
      return openrouter(modelName);
    default:
      throw new Error("Unknown provider");
  }
}
