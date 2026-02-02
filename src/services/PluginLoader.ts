import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Command } from "@/types/CommandDefinition";
import log from "@/utils/logger";
import { Settings, UpdateSettings } from "@/config/settings";
import { BunApiRouter } from "@/utils/router";
import useFraudeStore from "@/store/useFraudeStore";
import type { PluginContext } from "@/types/PluginContext";
import Agent from "@/agent/agent";

export class PluginLoader {
  private pluginsDirs: string[];

  constructor() {
    // Get the system-wide config directory
    const configDir = (Settings as any).instance
      ? Settings.getInstance().getAll()
        ? (Settings as any).instance.settingsDir
        : ""
      : "";

    this.pluginsDirs = [
      path.resolve(import.meta.dir, "../../plugins"), // Plugin folder in the source/package root
      path.resolve(process.cwd(), ".fraude", "plugins"), // Local plugins in the current working directory
      path.resolve(os.homedir(), "fraude", "plugins"), // Global plugins in the home directory
    ];

    if (configDir) {
      this.pluginsDirs.push(path.join(configDir, "plugins")); // Global system config plugins
    }

    // Add any plugins folder relative to the executable if not already covered
    const execPath = process.argv[1];
    if (execPath) {
      const execDir = path.dirname(execPath);
      if (execDir !== process.cwd()) {
        this.pluginsDirs.push(path.resolve(execDir, "./plugins"));
      }
    }

    // De-duplicate paths
    this.pluginsDirs = Array.from(new Set(this.pluginsDirs));
  }

  async loadPlugins(): Promise<Command[]> {
    const allCommands: Command[] = [];
    const loadedPluginNames = new Set<string>();

    const context: PluginContext = {
      log: log,
      Router: BunApiRouter,
      router: BunApiRouter.shared,
      Agent: Agent,
      settings: {
        get: (key) => Settings.getInstance().get(key as any),
        getAll: () => Settings.getInstance().getAll(),
        update: async (updates) => {
          await UpdateSettings(updates);
        },
      },
      ui: {
        updateOutput: (type, content) =>
          useFraudeStore.getState().updateOutput(type, content),
      },
      utils: {},
    };

    for (const dir of this.pluginsDirs) {
      try {
        await fs.access(dir);
      } catch {
        continue;
      }

      log(`Searching for plugins in: ${dir}`);
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (loadedPluginNames.has(entry.name)) continue;

          const pluginPath = path.join(dir, entry.name);
          const entryPoint = path.join(pluginPath, "index.ts");

          try {
            await fs.access(entryPoint);
            const pluginModule = await import(entryPoint);

            if (pluginModule.default) {
              let commands: Command | Command[];

              if (typeof pluginModule.default === "function") {
                // Context-aware plugin
                commands = await pluginModule.default(context);
              } else {
                // Legacy static object plugin
                commands = pluginModule.default;
              }

              if (Array.isArray(commands)) {
                allCommands.push(...commands);
              } else {
                allCommands.push(commands);
              }
              loadedPluginNames.add(entry.name);
              log(`Loaded plugin: ${entry.name} from ${dir}`);
            }
          } catch (e) {
            // Only log error if index.ts exists but failed to load
            try {
              await fs.access(entryPoint);
              log(`Failed to load plugin ${entry.name}:`, e);
            } catch {
              // index.ts doesn't exist, ignore
            }
          }
        }
      }
    }
    return allCommands;
  }
}
