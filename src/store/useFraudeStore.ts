import { create } from "zustand";
import type { PendingChange } from "../types/state";

export type OutputItemType =
  | "log"
  | "markdown"
  | "diff"
  | "confirmation"
  | "command"
  | "comment";

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
  status: number; // 0 = idle, 1 = loading, 2 = done, -1 = interrupted, 3 = awaiting confirmation, 4 = awaiting implementation comment
  outputItems: OutputItem[];
  tokenUsage: TokenUsage;
  elapsedTime: number;
  pendingChanges: PendingChange[];
  statusText?: string;
}

export type SelectItem = {
  label: string;
  value: any;
};

export interface PromptInfo {
  query: string;
  options?: SelectItem[];
  selectedOption?: any;
}

interface FraudeStore {
  started: boolean;
  interactions: Record<string, InteractionState>;
  interactionOrder: string[];
  currentInteractionId: string | null;
  abortController: AbortController | null;
  history: string[];
  executionMode: "Planning" | "Fast";
  promptInfo: PromptInfo | null;
  implementationComment: string | null;
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
  promptUserConfirmation: (
    promptInfo?: PromptInfo,
    id?: string
  ) => Promise<boolean>;
  resolveConfirmation: (confirmed: boolean) => void;
  promptImplementationPlanCheck: (id?: string) => Promise<number>;
  commentPromise: (id?: string) => Promise<string>;
  resolveComment: (comment: string, id?: string) => void;
  addToHistory: (query: string) => void;
  setExecutionMode: (mode: "Planning" | "Fast") => void;
}

export const useFraudeStore = create<FraudeStore>((set) => ({
  started: false,
  interactions: {},
  interactionOrder: [],
  currentInteractionId: null,
  abortController: null,
  history: [],
  executionMode: "Fast",
  promptInfo: null,
  implementationComment: null,
  addInteraction: () => {
    const id = crypto.randomUUID();
    const newInteraction: InteractionState = {
      interactionId: id,
      status: 0,
      outputItems: [],
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
      elapsedTime: 0,
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

  promptUserConfirmation: (promptInfo?: PromptInfo, id?: string) => {
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
          promptInfo,
          interactions: {
            ...state.interactions,
            [interactionId]: {
              ...interaction,
              status: 3,
            },
          },
        };
      });
    });
  },

  resolveConfirmation: (confirmed) => {
    if (confirmationResolver) {
      confirmationResolver(confirmed);
      confirmationResolver = null;
    }
  },

  promptImplementationPlanCheck: (id?: string) => {
    return new Promise((resolve) => {
      const interactionId =
        id || useFraudeStore.getState().currentInteractionId;
      if (!interactionId) {
        resolve(2);
        return;
      }
      confirmationResolver = resolve;
      set((state) => {
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        return {
          promptInfo: {
            query: "Do you want to proceed with this implementation plan?",
            options: [
              { value: 0, label: "Yes" },
              { value: 1, label: "No (modify plan)" },
              { value: 2, label: "No (cancel)" },
            ],
          },
          interactions: {
            ...state.interactions,
            [interactionId]: {
              ...interaction,
              status: 3,
            },
          },
        };
      });
    });
  },

  commentPromise: (id?: string) => {
    return new Promise((resolve) => {
      const interactionId =
        id || useFraudeStore.getState().currentInteractionId;
      if (!interactionId) {
        resolve("");
        return;
      }
      commentResolver = resolve;
      set((state) => {
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        return {
          interactions: {
            ...state.interactions,
            [interactionId]: {
              ...interaction,
              status: 4,
            },
          },
        };
      });
    });
  },

  resolveComment: (comment: string, id?: string) => {
    const interactionId = id || useFraudeStore.getState().currentInteractionId;
    if (commentResolver) {
      commentResolver(comment);
      commentResolver = null;
    }
    if (interactionId) {
      set((state) => {
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        return {
          implementationComment: comment,
          interactions: {
            ...state.interactions,
            [interactionId]: { ...interaction, status: 1 },
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
  setExecutionMode: (mode) => set({ executionMode: mode }),
}));

let confirmationResolver: ((selected: any) => void) | null = null;
let commentResolver: ((comment: string) => void) | null = null;

export const getInteraction = (id?: string | null) => {
  if (!id) {
    let interactionId = useFraudeStore.getState().currentInteractionId;
    if (!interactionId) return undefined;
    return useFraudeStore.getState().interactions[interactionId];
  }
  return useFraudeStore.getState().interactions[id];
};

export const useInteraction = (id?: string | null) => {
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
