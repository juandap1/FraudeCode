import { create } from "zustand";
import { Settings, UpdateSettings } from "../config/settings";
import type { Model } from "../types/Model";

interface SettingsState {
  ollamaUrl: string;
  thinkerModel: string;
  generalModel: string;
  lightWeightModel: string;
  models: Model[];
  history: string[];
  groq_api_key: string;
  openrouter_api_key: string;
  // Actions
  setOllamaUrl: (url: string) => void;
  syncWithSettings: () => void;
}

const DEFAULTS = {
  ollamaUrl: "http://localhost:11434",
  thinkerModel: "qwen3:8b",
  generalModel: "llama3.1:latest",
  lightWeightModel: "llama3.1:latest",
  models: [] as Model[],
  history: [] as string[],
  groq_api_key: "",
  openrouter_api_key: "",
};

const useSettingsStore = create<SettingsState>()((set) => {
  return {
    ...DEFAULTS,

    setOllamaUrl: (url) => {
      try {
        UpdateSettings({ ollamaUrl: url });
      } catch (e) {
        console.error("Failed to save setting ollamaUrl:", e);
      }
      set({ ollamaUrl: url });
    },

    syncWithSettings: () => {
      try {
        const settings = Settings.getInstance();
        set({
          ollamaUrl: settings.get("ollamaUrl"),
          thinkerModel: settings.get("thinkerModel"),
          generalModel: settings.get("generalModel"),
          lightWeightModel: settings.get("lightWeightModel"),
          models: settings.get("models"),
          history: settings.get("history"),
          groq_api_key: settings.get("groq_api_key"),
          openrouter_api_key: settings.get("openrouter_api_key"),
        });
      } catch (e) {
        console.error("Failed to sync settings:", e);
      }
    },
  };
});

export default useSettingsStore;
