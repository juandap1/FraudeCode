import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGroq } from "@ai-sdk/groq";
import { createOllama } from "ollama-ai-provider-v2";
import { createCerebras } from "@ai-sdk/cerebras";
import { createMistral } from "@ai-sdk/mistral";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import useSettingsStore from "@/store/useSettingsStore";
import { parseModelUniqueId } from "@/types/Model";

const getSettings = () => useSettingsStore.getState();

/**
 * Get the provider type and actual model name from a model identifier.
 * Supports both:
 * - Unique ID format: "modelName|type" (e.g., "openai/gpt-oss-120b|openrouter")
 * - Legacy name-only format: "modelName" (e.g., "openai/gpt-oss-120b")
 */
const getProviderForModel = (
  modelIdentifier: string,
): { name: string; type: string } => {
  // Try parsing as unique ID (name|type format)
  const parsed = parseModelUniqueId(modelIdentifier);
  if (parsed) {
    return parsed;
  }

  // Fall back to name-only lookup for backwards compatibility
  const { models } = getSettings();
  const model = models.find((m) => m.name === modelIdentifier);
  if (!model) throw new Error(`Model not found: ${modelIdentifier}`);
  return { name: model.name, type: model.type };
};

export function getModel(modelIdentifier: string) {
  const { name, type } = getProviderForModel(modelIdentifier);
  switch (type) {
    case "groq":
      const groq = createGroq({
        apiKey: getSettings().groq_api_key || process.env.GROQ_API_KEY,
      });
      return groq(name);
    case "ollama":
      const ollama = createOllama({
        baseURL: `${getSettings().ollamaUrl || process.env.OLLAMA_URL || "http://localhost:11434"}/api`,
      });
      return ollama(name);
    case "openrouter":
      const openrouter = createOpenRouter({
        apiKey:
          getSettings().openrouter_api_key || process.env.OPENROUTER_API_KEY,
      });
      return openrouter(name);
    case "cerebras":
      const cerebras = createCerebras({
        apiKey: getSettings().cerebras_api_key || process.env.CEREBRAS_API_KEY,
      });
      return cerebras(name);
    case "mistral":
      const mistral = createMistral({
        apiKey: getSettings().mistral_api_key || process.env.MISTRAL_API_KEY,
      });
      return mistral(name);
    case "google":
      const google = createGoogleGenerativeAI({
        apiKey: getSettings().google_api_key || process.env.GOOGLE_API_KEY,
      });
      return google(name);
    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}
