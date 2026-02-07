#!/usr/bin/env bun

import { render } from "ink";
import App from "./components/App";
import log, { resetLog } from "./utils/logger";
import { Settings } from "./config/settings";
import useSettingsStore from "./store/useSettingsStore";
import OllamaClient from "@/services/ollama";
import MistralClient from "@/services/mistral";
import CerebrasClient from "@/services/cerebras";
import GoogleClient from "@/services/google";
import CommandCenter from "@/commands";
import { getKnowledgeOrchestrator } from "@/services/knowledgeOrchestrator";
import { checkForUpdate } from "./utils/updateCheck";
import { version } from "../package.json";

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

const syncModels = async () => {
  await OllamaClient.syncOllamaModels();
  await MistralClient.syncMistralModels();
  await CerebrasClient.syncCerebrasModels();
  await GoogleClient.syncGoogleModels();
};

async function main() {
  resetLog();
  console.clear();

  try {
    const envFile = Bun.file(".env");
    if (await envFile.exists()) {
      const envText = await envFile.text();
      const lines = envText.split("\n");
      for (const line of lines) {
        const [key, ...valueParts] = line.trim().split("=");
        if (key && !key.startsWith("#") && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^["']|["']$/g, "");
          process.env[key.trim()] = value;
          log(`Loaded env var: ${key.trim()}`);
        }
      }
    }
  } catch (e) {
    log(`Failed to load .env file: ${e}`);
  }

  await Settings.init();
  useSettingsStore.getState().syncWithSettings();
  await CommandCenter.loadPlugins();
  syncModels();
  const { waitUntilExit } = render(<App />, { exitOnCtrlC: false });

  // Asynchronous update check
  checkForUpdate(version).then((newVersion) => {
    if (newVersion) {
      useSettingsStore.getState().setUpdateAvailable(newVersion);
    }
  });

  // Background index the project (fire-and-forget)
  getKnowledgeOrchestrator()
    .indexProject(process.cwd())
    .catch((e: Error) => log(`Background indexing failed: ${e}`));

  // Handle graceful exit
  const exitHandler = () => {
    process.exit(0);
  };

  process.on("SIGTERM", exitHandler);

  await waitUntilExit();
  process.exit(0);
}

main();
