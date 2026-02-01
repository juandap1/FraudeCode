import { create } from "zustand";
import { Settings, UpdateSettings } from "../config/settings";
import { SettingsSchema, type Config } from "../config/schema";

interface SettingsActions {
  setOllamaUrl: (url: string) => void;
  syncWithSettings: () => void;
}

type SettingsState = Config & SettingsActions;

const DEFAULTS = SettingsSchema.parse({});

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
        set(settings.getAll());
      } catch (e) {
        console.error("Failed to sync settings:", e);
      }
    },
  } as SettingsState;
});

export default useSettingsStore;
