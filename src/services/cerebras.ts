import { UpdateSettings } from "@/config/settings";
import useSettingsStore from "../store/useSettingsStore";
import type { Model } from "../types/Model";

const getSettings = () => useSettingsStore.getState();

interface CerebrasModelsResponse {
  object: string;
  data: CerebrasModel[];
}

interface CerebrasModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

class CerebrasClient {
  async syncCerebrasModels() {
    const apiKey =
      getSettings().cerebras_api_key || process.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      return;
    }
    const url = `https://api.cerebras.ai/v1/models`;
    const options = {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    };
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Failed to fetch Cerebras models ${response.status}`);
    }
    const data = (await response.json()) as CerebrasModelsResponse;
    const savedModels = getSettings().models;
    const existingCerebrasModels = savedModels.filter(
      (m) => m.type === "cerebras",
    );
    const otherModels = savedModels.filter((m) => m.type !== "cerebras");

    const models: Model[] = data.data.map((model) => {
      const existing = existingCerebrasModels.find((m) => m.name === model.id);
      return {
        type: "cerebras",
        name: model.id,
        modified_at: new Date(model.created * 1000).toISOString(),
        digest: existing?.digest || "",
        usage: existing?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        details: {
          provider: "cerebras",
          ...existing?.details,
        },
      } as Model;
    });

    // Merge: keep all other models, and replace/add the synced cerebras models
    // Note: This effectively removes local cerebras models that are no longer returned by the API.
    // If we want to keep them, we should change logic. But usually sync reflects source of truth.
    const mergedModels = [...otherModels, ...models];
    await UpdateSettings({ models: mergedModels });
  }
}

export default new CerebrasClient();
