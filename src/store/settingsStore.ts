import { create } from "zustand";
import { Settings, type Model } from "../utils/Settings";

interface SettingsState {
  ollamaUrl: string;
  thinkerModel: string;
  generalModel: string;
  scoutModel: string;
  models: Model[];
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
  scoutModel: "qwen2.5:0.5b",
  models: [] as Model[],
  groq_api_key: "",
  openrouter_api_key: "",
};

export const useSettingsStore = create<SettingsState>()((set) => {
  return {
    ...DEFAULTS,

    setOllamaUrl: (url) => {
      try {
        Settings.getInstance().set("ollamaUrl", url);
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
          scoutModel: settings.get("scoutModel"),
          models: settings.get("models"),
          groq_api_key: settings.get("groq_api_key"),
          openrouter_api_key: settings.get("openrouter_api_key"),
        });
      } catch (e) {
        console.error("Failed to sync settings:", e);
      }
    },
  };
});
