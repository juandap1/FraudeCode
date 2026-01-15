import { z } from "zod";
import log from "../utils/logger";
import { join } from "path";
import { homedir, platform } from "os";
import { rename, mkdir } from "fs/promises";
import { ModelSchema } from "../types/Model";
import useSettingsStore from "@/store/useSettingsStore";

const SettingsSchema = z.object({
  lifetimeTokenUsage: z.number().default(0),
  lastOpened: z.iso.datetime().optional(),
  ollamaUrl: z.string().default("http://localhost:11434"),
  thinkerModel: z.string().default("qwen3:8b"),
  generalModel: z.string().default("llama3.1:latest"),
  lightWeightModel: z.string().default("llama3.1:latest"),
  models: z.array(ModelSchema).default([]),
  history: z.array(z.string()).default([]),
  openrouter_api_key: z.string().optional(),
  groq_api_key: z.string().optional(),
});

type Config = z.infer<typeof SettingsSchema>;

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

    const configDir = Settings.getConfigDir("fraude-code");
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
   * Get the platform-specific config directory.
   */
  private static getConfigDir(appName: string): string {
    const osPlatform = platform();
    const home = homedir();

    switch (osPlatform) {
      case "win32":
        return join(
          process.env.APPDATA || join(home, "AppData", "Roaming"),
          appName
        );
      case "darwin":
        return join(home, "Library", "Application Support", appName);
      case "linux":
        return join(
          process.env.XDG_CONFIG_HOME || join(home, ".config"),
          appName
        );
      default:
        return join(home, `.${appName}`);
    }
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
          "Invalid settings found, using defaults:",
          result.error.format()
        );
        return SettingsSchema.parse({});
      }

      return result.data;
    } catch (e) {
      console.error("Error loading settings:", e);
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
  const newHistory = [value, ...history].slice(0, 50);
  await UpdateSettings({ history: newHistory });
};

export default Settings;

export { Settings, type Config, UpdateSettings, addHistory };
