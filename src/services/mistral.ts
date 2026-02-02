import { UpdateSettings } from "@/config/settings";
import useSettingsStore from "../store/useSettingsStore";
import type { Model } from "../types/Model";

const getSettings = () => useSettingsStore.getState();

interface MistralModelsResponse {
  object: string;
  data: MistralModel[];
}

interface MistralModel {
  capabilities: object;
  created: number;
  id: string;
  max_context_length: number;
  name: string;
  owned_by: string;
}

class MistralClient {
  async syncMistralModels() {
    const apiKey = getSettings().mistral_api_key || process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return;
    }
    const url = `https://api.mistral.ai/v1/models`;
    const options = {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    };
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Failed to fetch Mistral models ${response.status}`);
    }
    const data = (await response.json()) as MistralModelsResponse;
    const savedModels = getSettings().models;
    const existingMistralModels = savedModels.filter(
      (m) => m.type === "mistral",
    );
    const otherModels = savedModels.filter((m) => m.type !== "mistral");

    const models: Model[] = data.data
      .map((model) => {
        const capabilities: string[] = [];
        Object.entries(model.capabilities).map(([key, value]) => {
          if (value === true) {
            capabilities.push(key);
          }
        });

        const existing = existingMistralModels.find((m) => m.name === model.id);

        return {
          type: "mistral",
          name: model.id,
          modified_at: new Date(model.created * 1000).toISOString(),
          digest: existing?.digest || "",
          capabilities,
          usage: existing?.usage || {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          details: {
            provider: model.owned_by,
            context_length: model.max_context_length,
            ...existing?.details,
          },
        } as Model;
      })
      .filter((m) => m.name.includes("latest"));

    const mergedModels = [...otherModels, ...models];
    await UpdateSettings({ models: mergedModels });
  }
}

export default new MistralClient();
