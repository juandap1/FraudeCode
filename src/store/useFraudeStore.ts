import { create } from "zustand";
import type { OutputItem, OutputItemType } from "@/types/OutputItem";
import ContextManager from "@/agent/contextManager";
import log from "@/utils/logger";

interface ModelSelectionRequest {
  originalModel: string;
  errorMessage: string;
  resolve: (modelName: string | null) => void;
}

interface FraudeStore {
  executionMode: 0 | 1 | 2; // 0 = Fast, 1 = Plan, 2 = Ask
  outputItems: OutputItem[];
  started: boolean;
  status: number; // 0 = idle, 1 = running, 2 = waiting, 3 = reviewing changes, 4 = awaiting model selection, -1 = interrupted
  elapsedTime: number;
  lastBreak: number;
  statusText?: string;
  contextManager: ContextManager;
  researchCache?: Record<string, string>;
  abortController: AbortController | null;
  pendingModelSelection: ModelSelectionRequest | null;
  interruptAgent: () => void;
  updateOutput: (
    type: OutputItemType,
    content: string,
    config?: {
      duration?: number;
      dontOverride?: boolean;
    },
  ) => void;
  requestModelSelection: (
    originalModel: string,
    errorMessage: string,
  ) => Promise<string | null>;
  resolveModelSelection: (modelName: string | null) => void;
}

const useFraudeStore = create<FraudeStore>((set, get) => ({
  executionMode: 0 as 0 | 1 | 2,
  outputItems: [],
  started: false,
  status: 0,
  elapsedTime: 0,
  lastBreak: 0,
  statusText: "",
  contextManager: new ContextManager(),
  researchCache: undefined,
  abortController: null,
  pendingModelSelection: null,
  interruptAgent: () => {
    const controller = get().abortController;
    if (controller && !controller.signal.aborted) {
      try {
        controller.abort();
      } catch (e) {
        log(`Abort caught: ${e}`);
      }
    }
  },
  updateOutput: (type, rawContent, config) => {
    set((state) => {
      const outputItems = [...state.outputItems];
      const latestOutput = outputItems[outputItems.length - 1];
      const dontOverrideType = new Set(["log", "interrupted", "command"]);
      let content = rawContent.replaceAll(process.cwd(), "@");
      if (
        latestOutput &&
        latestOutput.type === type &&
        !dontOverrideType.has(type) &&
        !config?.dontOverride
      ) {
        outputItems[outputItems.length - 1] = {
          ...latestOutput,
          content,
          duration: config?.duration,
        };
      } else {
        outputItems.push({
          id: crypto.randomUUID(),
          type,
          content,
          duration: config?.duration,
        });
      }
      return {
        outputItems,
      };
    });
  },
  requestModelSelection: (originalModel: string, errorMessage: string) => {
    return new Promise<string | null>((resolve) => {
      set({
        status: 4, // awaiting model selection
        statusText: "Awaiting model selection...",
        pendingModelSelection: {
          originalModel,
          errorMessage,
          resolve,
        },
      });
      // Also add to output items so it renders
      get().updateOutput(
        "modelSelect",
        JSON.stringify({ originalModel, errorMessage }),
      );
    });
  },
  resolveModelSelection: (modelName: string | null) => {
    const pending = get().pendingModelSelection;
    if (pending) {
      pending.resolve(modelName);
      set({
        status: modelName ? 1 : 0, // back to running or idle
        statusText: modelName ? "Retrying with new model..." : "",
        pendingModelSelection: null,
      });
    }
  },
}));

export default useFraudeStore;
