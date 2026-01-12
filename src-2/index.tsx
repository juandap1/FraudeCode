import { render } from "ink";
import App from "./components/App";
import { resetLog } from "./utils/logger";
import { Settings } from "./utils/settings";
import useSettingsStore from "./store/useSettingsStore";
import { syncOllamaModels } from "./services/ollama";

async function main() {
  resetLog();
  console.clear();
  await Settings.init();
  syncOllamaModels();
  useSettingsStore.getState().syncWithSettings();
  render(<App />);
}

main();
