import { render } from "ink";
import App from "./components/App";
import { useSettingsStore } from "./store/settingsStore";
import { resetLog } from "./utils/logger";
import { Settings, UpdateSettings } from "./utils/Settings";
import { syncOllamaModels } from "./services/llm";

async function main() {
  resetLog();
  console.clear();
  await Settings.init();
  syncOllamaModels().catch((e) => {
    console.error("Background model sync failed:", e);
  });
  useSettingsStore.getState().syncWithSettings();
  UpdateSettings("lastOpened", new Date().toISOString());
  render(<App />);
}

main();
