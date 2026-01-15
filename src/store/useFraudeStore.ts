import { create } from "zustand";
import type { OutputItem, OutputItemType } from "@/types/OutputItem";
import ContextManager from "@/agent/contextManager";

interface FraudeStore {
  outputItems: OutputItem[];
  started: boolean;
  status: number; // 0 = idle, 1 = running
  elapsedTime: number;
  lastBreak: number;
  statusText?: string;
  contextManager: ContextManager;
  updateOutput: (type: OutputItemType, content: string) => void;
}

const useFraudeStore = create<FraudeStore>((set) => ({
  outputItems: [],
  started: false,
  status: 0,
  elapsedTime: 0,
  lastBreak: 0,
  statusText: "",
  contextManager: new ContextManager(),
  updateOutput: (type, content) => {
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
        !dontOverrideType.has(type)
      ) {
        outputItems[outputItems.length - 1] = {
          ...latestOutput,
          content,
        };
      } else {
        outputItems.push({
          id: crypto.randomUUID(),
          type,
          content,
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
