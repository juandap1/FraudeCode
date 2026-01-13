import { render } from "ink";
import App from "./components/App";
import { resetLog } from "./utils/logger";
import { Settings } from "./config/settings";
import useSettingsStore from "./store/useSettingsStore";
import OllamaClient from "./services/ollama";

async function main() {
  resetLog();
  console.clear();
  await Settings.init();
  OllamaClient.syncOllamaModels();
  useSettingsStore.getState().syncWithSettings();
  render(<App />);
}

main();
