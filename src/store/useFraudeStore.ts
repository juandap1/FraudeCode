import { create } from "zustand";
import type { PendingChange } from "../types/state";

export type OutputItemType =
  | "log"
  | "markdown"
  | "diff"
  | "confirmation"
  | "command";

export interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
}

export interface OutputItem {
  id: string;
  type: OutputItemType;
  content: string;
  title?: string;
  changes?: PendingChange[];
}

export interface InteractionState {
  interactionId: string;
  status: number; // 0 = idle, 1 = loading, 2 = done, -1 = interrupted, 3 = awaiting confirmation
  outputItems: OutputItem[];
  tokenUsage: TokenUsage;
  elapsedTime: number;
  pendingConfirmation: boolean;
  pendingChanges: PendingChange[];
}

interface FraudeStore {
  started: boolean;
  interactions: Record<string, InteractionState>;
  interactionOrder: string[];
  currentInteractionId: string | null;
  // Actions
  addInteraction: () => string;
  updateInteraction: (id: string, updates: Partial<InteractionState>) => void;
  updateOutput: (
    type: OutputItemType,
    content: string,
    title?: string,
    changes?: PendingChange[],
    id?: string
  ) => void;
  setCurrentInteraction: (id: string | null) => void;
}

export const useFraudeStore = create<FraudeStore>((set) => ({
  started: false,
  interactions: {},
  interactionOrder: [],
  currentInteractionId: null,

  addInteraction: () => {
    const id = crypto.randomUUID();
    const newInteraction: InteractionState = {
      interactionId: id,
      status: 0,
      outputItems: [],
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
      elapsedTime: 0,
      pendingConfirmation: false,
      pendingChanges: [],
    };
    set((state) => ({
      interactions: { ...state.interactions, [id]: newInteraction },
      interactionOrder: [...state.interactionOrder, id],
      currentInteractionId: id,
    }));
    return id;
  },

  updateInteraction: (id, updates) => {
    set((state) => {
      const interaction = state.interactions[id];
      if (!interaction) return state;
      return {
        interactions: {
          ...state.interactions,
          [id]: { ...interaction, ...updates },
        },
      };
    });
  },

  updateOutput: (type, content, title, changes, id?: string) => {
    set((state) => {
      const interactionId = id || state.currentInteractionId;
      if (!interactionId) return state;
      const interaction = state.interactions[interactionId];
      if (!interaction) return state;
      const outputItems = [...interaction.outputItems];
      const latestOutput = outputItems[outputItems.length - 1];
      if (latestOutput && latestOutput.type === type && type !== "log") {
        outputItems[outputItems.length - 1] = {
          ...latestOutput,
          content,
          changes: [...(latestOutput.changes || []), ...(changes || [])],
        };
      } else {
        outputItems.push({
          id: crypto.randomUUID(),
          type,
          content,
          title,
          changes,
        });
      }
      return {
        interactions: {
          ...state.interactions,
          [interactionId]: {
            ...interaction,
            outputItems,
          },
        },
      };
    });
  },

  setCurrentInteraction: (id) => set({ currentInteractionId: id }),
}));

export const getInteraction = (id: string | null) => {
  if (!id) return undefined;
  return useFraudeStore.getState().interactions[id];
};

export const useInteraction = (id: string | null) => {
  if (!id)
    return useFraudeStore(
      (state) => state.interactions[state.interactionOrder.length - 1]
    );
  return useFraudeStore((state) => (id ? state.interactions[id] : undefined));
};
