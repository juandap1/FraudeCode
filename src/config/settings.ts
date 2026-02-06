import { z } from "zod";
import log from "../utils/logger";
import { join } from "path";
import { rename, mkdir } from "fs/promises";
import { getConfigDir } from "../utils/paths";
import { ModelSchema, parseModelUniqueId } from "../types/Model";
import type { TokenUsage } from "@/types/TokenUsage";
import useSettingsStore from "@/store/useSettingsStore";
import { SettingsSchema, type Config } from "./schema";
import useFraudeStore from "@/store/useFraudeStore";

class Settings {
  private static instance: Settings | null = null;
  private settingsDir: string;
  private settings: Config;
  private writePromise: Promise<void> = Promise.resolve(); // Chain writes to prevent race conditions

  private constructor(config: Config, configDir: string) {
    this.settings = config;
    log("Settings loaded:", JSON.stringify(this.settings, null, 2));
    this.settingsDir = configDir;
  }

  /**
   * Initialize the Settings singleton. Call this once at app startup.
   */
  static async init(): Promise<Settings> {
    if (Settings.instance) {
      return Settings.instance;
    }

    const configDir = getConfigDir("fraude-code");
    const config = await Settings.loadFromDisk(configDir);
    Settings.instance = new Settings(config, configDir);
    return Settings.instance;
  }

  /**
   * Get the Settings instance. Throws if init() hasn't been called.
   */
  static getInstance(): Settings {
    if (!Settings.instance) {
      throw new Error("Settings not initialized. Call Settings.init() first.");
    }
    return Settings.instance;
  }

  /**
   * Get a specific setting value.
   */
  get<K extends keyof Config>(key: K): Config[K] {
    return this.settings[key];
  }

  /**
   * Get all settings.
   */
  getAll(): Config {
    return { ...this.settings };
  }

  /**
   * Update settings and persist to disk.
   */
  async set<K extends keyof Config>(key: K, value: Config[K]): Promise<void> {
    this.settings[key] = value;
    await this.saveToDisk();
  }

  /**
   * Update multiple settings at once and persist to disk (single write).
   */
  async setMultiple(updates: Partial<Config>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      (this.settings as any)[key] = value;
    }
    await this.saveToDisk();
  }

  /**
   * Load settings from disk (static, used during initialization).
   */
  private static async loadFromDisk(configDir: string): Promise<Config> {
    try {
      const settingsPath = join(configDir, "settings.json");
      const file = Bun.file(settingsPath);

      if (!(await file.exists())) {
        return SettingsSchema.parse({}); // Return defaults
      }

      const rawData = await file.json();
      const result = SettingsSchema.safeParse(rawData);

      if (!result.success) {
        console.error(
          "Invalid settings found, attempting to merge with defaults:",
          result.error.format(),
        );

        // Backup the invalid settings file just in case
        try {
          await Bun.write(
            `${settingsPath}.bak`,
            JSON.stringify(rawData, null, 2),
          );
          useFraudeStore
            .getState()
            .updateOutput(
              "log",
              `Backed up invalid settings to ${settingsPath}.bak`,
            );
        } catch (backupError) {
          useFraudeStore
            .getState()
            .updateOutput("error", "Failed to backup settings:" + backupError);
        }

        // Return a merge of defaults and raw data to preserve what we can
        // We ensure critical fields like 'models' are at least the right type
        const defaults = SettingsSchema.parse({});
        const merged = { ...defaults, ...rawData };

        // Safety checks for critical types to prevent runtime crashes
        if (!Array.isArray(merged.models)) merged.models = defaults.models;
        if (!Array.isArray(merged.history)) merged.history = defaults.history;

        return merged as Config;
      }

      return result.data;
    } catch (e) {
      useFraudeStore
        .getState()
        .updateOutput("error", "Error loading settings:" + e);
      return SettingsSchema.parse({});
    }
  }

  /**
   * Save current settings to disk atomically.
   * Writes are chained to prevent race conditions.
   */
  private async saveToDisk(): Promise<void> {
    // Chain this write after any pending write completes
    const doWrite = async () => {
      const settingsPath = join(this.settingsDir, "settings.json");
      const tempPath = `${settingsPath}.tmp`;
      const content = JSON.stringify(this.settings, null, 2);

      // Ensure the directory exists
      await mkdir(this.settingsDir, { recursive: true });

      await Bun.write(tempPath, content);
      await rename(tempPath, settingsPath);
    };

    // Queue this write after the previous one (even if it failed)
    this.writePromise = this.writePromise.then(doWrite, doWrite);
    await this.writePromise;
  }
}

const UpdateSettings = async (updates: Partial<Config>) => {
  await Settings.getInstance().setMultiple(updates);
  useSettingsStore.setState({ ...updates });
};

const addHistory = async (value: string) => {
  const history = Settings.getInstance().get("history");
  if (value.trim().toLowerCase() != history[0]?.trim().toLowerCase()) {
    const newHistory = [value, ...history].slice(0, 50);
    await UpdateSettings({ history: newHistory });
  }
};

/**
 * Increment token usage for a specific model.
 * @param modelIdentifier - The model identifier (can be unique ID "name|type" or just "name")
 * @param usage - Token usage data with prompt, completion, and total counts
 */
const incrementModelUsage = async (
  modelIdentifier: string,
  usage: TokenUsage,
): Promise<void> => {
  if (usage.totalTokens <= 0) return;

  const settings = Settings.getInstance();
  const models = [...settings.get("models")];

  // Try parsing as unique ID (name|type format)
  const parsed = parseModelUniqueId(modelIdentifier);
  let modelIndex: number;

  if (parsed) {
    // Match by both name and type
    modelIndex = models.findIndex(
      (m) => m.name === parsed.name && m.type === parsed.type,
    );
  } else {
    // Fall back to name-only matching (legacy format)
    modelIndex = models.findIndex((m) => m.name === modelIdentifier);
  }

  if (modelIndex !== -1) {
    const model = models[modelIndex]!;
    models[modelIndex] = {
      ...model,
      usage: {
        promptTokens: (model.usage?.promptTokens ?? 0) + usage.promptTokens,
        completionTokens:
          (model.usage?.completionTokens ?? 0) + usage.completionTokens,
        totalTokens: (model.usage?.totalTokens ?? 0) + usage.totalTokens,
      },
    };
    // log(JSON.stringify(models, null, 2));
    await UpdateSettings({ models });
  }
};

export default Settings;

export {
  Settings,
  type Config,
  UpdateSettings,
  addHistory,
  incrementModelUsage,
};
