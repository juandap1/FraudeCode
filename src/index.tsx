import { render } from "ink";
import App from "./components/App";
import { resetLog } from "./utils/logger";
import { Settings } from "./config/settings";
import useSettingsStore from "./store/useSettingsStore";
import OllamaClient from "@/services/ollama";

// Global error handlers to catch and suppress AbortErrors
process.on("unhandledRejection", (reason) => {
  // Suppress AbortErrors - they're expected when cancelling operations
  if (
    reason instanceof Error &&
    (reason.name === "AbortError" ||
      reason.message === "The operation was aborted.")
  ) {
    return;
  }
  // For DOMException AbortError (code 20)
  if (
    reason &&
    typeof reason === "object" &&
    "code" in reason &&
    reason.code === 20
  ) {
    return;
  }
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  // Suppress AbortErrors
  if (
    error.name === "AbortError" ||
    error.message === "The operation was aborted."
  ) {
    return;
  }
  console.error("Uncaught exception:", error);
  process.exit(1);
});

async function main() {
  resetLog();
  console.clear();
  await Settings.init();
  useSettingsStore.getState().syncWithSettings();
  OllamaClient.syncOllamaModels();
  render(<App />);
}

main();
