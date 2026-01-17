import { create } from "zustand";
import type { OutputItem, OutputItemType } from "@/types/OutputItem";
import ContextManager from "@/agent/contextManager";
import log from "@/utils/logger";

interface FraudeStore {
  executionMode: 0 | 1 | 2; // 0 = Fast, 1 = Plan, 2 = Ask
  outputItems: OutputItem[];
  started: boolean;
  status: number; // 0 = idle, 1 = running, -1 = interrupted
  elapsedTime: number;
  lastBreak: number;
  statusText?: string;
  contextManager: ContextManager;
  abortController: AbortController | null;
  interruptAgent: () => void;
  updateOutput: (
    type: OutputItemType,
    content: string,
    config?: {
      duration?: number;
      dontOverride?: boolean;
    },
  ) => void;
}

const useFraudeStore = create<FraudeStore>((set, get) => ({
  executionMode: 0,
  outputItems: [],
  started: false,
  status: 0,
  elapsedTime: 0,
  lastBreak: 0,
  statusText: "",
  contextManager: new ContextManager(),
  abortController: null,
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
  updateOutput: (type, content, config) => {
    set((state) => {
      const outputItems = [...state.outputItems];
      const latestOutput = outputItems[outputItems.length - 1];
      let extraChanges = {};
      // if (type === "checkpoint") {
      //   let elapsed = state.elapsedTime - state.lastBreak;
      //   extraChanges = {
      //     lastBreak: state.elapsedTime,
      //   };
      //   content += ` · (${(elapsed / 10).toFixed(1)}s)`;
      // }
      const dontOverrideType = new Set(["log", "checkpoint"]);
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
        ...extraChanges,
      };
    });
  },
}));

export default useFraudeStore;
