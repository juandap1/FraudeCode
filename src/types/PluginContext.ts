import { BunApiRouter } from "@/utils/router";
import type { Command } from "./CommandDefinition";
import Agent from "@/agent/agent";

export interface PluginContext {
  /**
   * Shared Router instance for registering endpoints
   */
  router: BunApiRouter;

  /**
   * Application logger
   */
  log: (...args: any[]) => void;

  /**
   * Router class for creating API endpoints
   */
  Router: typeof BunApiRouter;

  /**
   * The Agent class definition (constructor)
   */
  Agent: typeof Agent;

  /**
   * Settings management
   */
  settings: {
    get: (key: string) => any;
    getAll: () => any;
    update: (updates: any) => Promise<void>;
  };

  /**
   * UI / Store interaction
   */
  ui: {
    updateOutput: (
      type: "command" | "markdown" | "log" | "error",
      content: string,
    ) => void;
  };

  /**
   * Global utilities (optional, e.g. if we want to expose 3rd party libs)
   */
  utils: {
    // Add common utilities here if needed
  };
}

export type PluginInit = (
  context: PluginContext,
) => Promise<Command | Command[]> | Command | Command[];
