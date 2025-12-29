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
  interactions: InteractionState[];
  currentInteractionId: string | null;
  // Actions
  addInteraction: () => string;
  updateInteraction: (id: string, updates: Partial<InteractionState>) => void;
  addOutputItem: (
    id: string,
    type: OutputItemType,
    content: string,
    title?: string,
    changes?: PendingChange[]
  ) => void;
  updateLastOutputItem: (
    id: string,
    content: string,
    changes?: PendingChange[]
  ) => void;
  setCurrentInteraction: (id: string | null) => void;
}

export const useFraudeStore = create<FraudeStore>((set) => ({
  started: false,
  interactions: [],
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
      interactions: [...state.interactions, newInteraction],
      currentInteractionId: id,
    }));
    return id;
  },

  updateInteraction: (id, updates) => {
    set((state) => ({
      interactions: state.interactions.map((i) =>
        i.interactionId === id ? { ...i, ...updates } : i
      ),
    }));
  },

  addOutputItem: (id, type, content, title, changes) => {
    set((state) => ({
      interactions: state.interactions.map((i) => {
        if (i.interactionId === id) {
          return {
            ...i,
            outputItems: [
              ...i.outputItems,
              { id: crypto.randomUUID(), type, content, title, changes },
            ],
          };
        }
        return i;
      }),
    }));
  },

  updateLastOutputItem: (id, content, changes) => {
    set((state) => ({
      interactions: state.interactions.map((i) => {
        if (i.interactionId === id && i.outputItems.length > 0) {
          const updatedOutputItems = [...i.outputItems];
          const lastItem = updatedOutputItems[updatedOutputItems.length - 1]!;
          updatedOutputItems[updatedOutputItems.length - 1] = {
            ...lastItem,
            content,
            changes: changes ?? lastItem.changes,
          };
          return { ...i, outputItems: updatedOutputItems };
        }
        return i;
      }),
    }));
  },

  setCurrentInteraction: (id) => set({ currentInteractionId: id }),
}));

export const getInteraction = (id: string | null) => {
  return useFraudeStore
    .getState()
    .interactions.find((i) => i.interactionId === id);
};

export const useInteraction = (id: string | null) => {
  if (!id)
    return useFraudeStore(
      (state) => state.interactions[state.interactions.length - 1]
    );
  return useFraudeStore((state) =>
    id ? state.interactions.find((i) => i.interactionId === id) : undefined
  );
};
