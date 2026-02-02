import { UpdateSettings } from "@/config/settings";
import useSettingsStore from "../store/useSettingsStore";
import type { Model } from "../types/Model";

const getSettings = () => useSettingsStore.getState();

class GoogleClient {
  async syncGoogleModels() {
    if (!getSettings().google_api_key && !process.env.GOOGLE_API_KEY) {
      return;
    }
    const savedModels = getSettings().models;
    const existingGoogleModels = savedModels.filter((m) => m.type === "google");
    const otherModels = savedModels.filter((m) => m.type !== "google");

    const models: Model[] = [
      {
        type: "google",
        name: "gemini-3-flash-preview",
        modified_at: new Date().toISOString(),
        digest: "",
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        details: {
          provider: "google",
          context_length: 100000,
        },
      } as Model,
      {
        type: "google",
        name: "gemini-2.5-flash-lite",
        modified_at: new Date().toISOString(),
        digest: "",
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        details: {
          provider: "google",
          context_length: 100000,
        },
      } as Model,
    ].map((model) => {
      const existing = existingGoogleModels.find((m) => m.name === model.name);
      if (existing) {
        return {
          ...model,
          digest: existing.digest || "",
          usage: existing.usage || model.usage,
          details: { ...model.details, ...existing.details },
        };
      }
      return model;
    });

    const mergedModels = [...otherModels, ...models];
    await UpdateSettings({ models: mergedModels });
  }
}

export default new GoogleClient();
