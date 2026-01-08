import { create } from "zustand";
import { Settings, type Model } from "../utils/Settings";

interface SettingsState {
  ollamaUrl: string;
  thinkerModel: string;
  generalModel: string;
  scoutModel: string;
  models: Model[];
  // Actions
  setOllamaUrl: (url: string) => void;
  setThinkerModel: (model: string) => void;
  setGeneralModel: (model: string) => void;
  setScoutModel: (model: string) => void;
  syncWithSettings: () => void;
}

const DEFAULTS = {
  ollamaUrl: "http://localhost:11434",
  thinkerModel: "qwen3:8b",
  generalModel: "llama3.1:latest",
  scoutModel: "qwen2.5:0.5b",
  models: [] as Model[],
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
    setThinkerModel: (model) => {
      try {
        Settings.getInstance().set("thinkerModel", model);
      } catch (e) {
        console.error("Failed to save setting thinkerModel:", e);
      }
      set({ thinkerModel: model });
    },
    setGeneralModel: (model) => {
      try {
        Settings.getInstance().set("generalModel", model);
      } catch (e) {
        console.error("Failed to save setting generalModel:", e);
      }
      set({ generalModel: model });
    },
    setScoutModel: (model) => {
      try {
        Settings.getInstance().set("scoutModel", model);
      } catch (e) {
        console.error("Failed to save setting scoutModel:", e);
      }
      set({ scoutModel: model });
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
        });
      } catch (e) {
        console.error("Failed to sync settings:", e);
      }
    },
  };
});
