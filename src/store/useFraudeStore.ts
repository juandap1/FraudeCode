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
  statusText?: string;
}

interface FraudeStore {
  started: boolean;
  interactions: Record<string, InteractionState>;
  interactionOrder: string[];
  currentInteractionId: string | null;
  abortController: AbortController | null;
  history: string[];
  // Actions
  addInteraction: () => string;
  updateInteraction: (id: string, updates: Partial<InteractionState>) => void;
  updateTokenUsage: (usage: TokenUsage, id?: string) => void;
  updateOutput: (
    type: OutputItemType,
    content: string,
    title?: string,
    changes?: PendingChange[],
    id?: string
  ) => void;
  setStatus: (statusText: string | undefined, id?: string) => void;
  setCurrentInteraction: (id: string | null) => void;
  promptUserConfirmation: (id?: string) => Promise<boolean>;
  resolveConfirmation: (confirmed: boolean, id?: string) => void;
  addToHistory: (query: string) => void;
}

export const useFraudeStore = create<FraudeStore>((set) => ({
  started: false,
  interactions: {},
  interactionOrder: [],
  currentInteractionId: null,
  abortController: null,
  history: [],
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
      statusText: undefined,
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
  updateTokenUsage: (usage: TokenUsage, id?: string) => {
    set((state) => {
      const interactionId = id || state.currentInteractionId;
      if (!interactionId) return state;
      const interaction = state.interactions[interactionId];
      if (!interaction) return state;
      let currentUsage = interaction.tokenUsage;
      currentUsage.total += usage.total;
      currentUsage.prompt += usage.prompt;
      currentUsage.completion += usage.completion;
      return {
        interactions: {
          ...state.interactions,
          [interactionId]: {
            ...interaction,
            tokenUsage: currentUsage,
          },
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
  setStatus: (statusText, id) => {
    set((state) => {
      const interactionId = id || state.currentInteractionId;
      if (!interactionId) return state;
      const interaction = state.interactions[interactionId];
      if (!interaction) return state;
      return {
        interactions: {
          ...state.interactions,
          [interactionId]: {
            ...interaction,
            statusText,
          },
        },
      };
    });
  },

  setCurrentInteraction: (id) => set({ currentInteractionId: id }),

  promptUserConfirmation: (id) => {
    return new Promise((resolve) => {
      const interactionId =
        id || useFraudeStore.getState().currentInteractionId;
      if (!interactionId) {
        resolve(false);
        return;
      }
      confirmationResolver = resolve;
      set((state) => {
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        return {
          interactions: {
            ...state.interactions,
            [interactionId]: {
              ...interaction,
              pendingConfirmation: true,
              status: 3,
            },
          },
        };
      });
    });
  },

  resolveConfirmation: (confirmed, id) => {
    const interactionId = id || useFraudeStore.getState().currentInteractionId;
    if (confirmationResolver) {
      confirmationResolver(confirmed);
      confirmationResolver = null;
    }
    if (interactionId) {
      set((state) => {
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        return {
          interactions: {
            ...state.interactions,
            [interactionId]: { ...interaction, pendingConfirmation: false },
          },
        };
      });
    }
  },

  addToHistory: (query) => {
    if (!query.trim()) return;
    set((state) => {
      const newHistory = [
        query,
        ...state.history.filter((item) => item !== query),
      ].slice(0, 50);
      return { history: newHistory };
    });
  },
}));

let confirmationResolver: ((confirmed: boolean) => void) | null = null;

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

export const initSignal = () => {
  let existing = useFraudeStore.getState().abortController;
  if (existing) {
    existing.abort();
  }
  useFraudeStore.setState({ abortController: new AbortController() });
};

export const interrupt = () => {
  const state = useFraudeStore.getState();
  if (state.abortController) {
    state.abortController.abort();
  }

  const interactionId = state.currentInteractionId;
  if (interactionId) {
    state.updateInteraction(interactionId, {
      status: -1,
    });
  }
};

export const getSignal = () =>
  useFraudeStore.getState().abortController?.signal;
