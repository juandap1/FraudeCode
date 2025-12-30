import { useCallback, useRef, useEffect, useState } from "react";

import qdrant from "../services/qdrant";
import type { PendingChange } from "../types/state";

import { createModifyProjectTool } from "../core/tools/ModifyProjectTool";
import { createSummarizeProjectTool } from "../core/tools/SummarizeProjectTool";
import { createRouterGraph } from "../core/agent/router";
import { HumanMessage } from "@langchain/core/messages";
import { useFraudeStore, useInteraction } from "../store/useFraudeStore";
import log from "../utils/logger";

export interface OllamaCLI {
  handleQuery: (query: string) => Promise<void>;
  interrupt: () => void;
  embedString: (query: string) => Promise<number[]>;
  confirmModification: (confirmed: boolean) => void;
  pendingConfirmation: boolean;
  pendingChanges: PendingChange[];
  interactionId: string | null;
}

export function useOllamaClient(initialId: string | null = null): OllamaCLI {
  const [interactionId, setInteractionId] = useState<string | null>(initialId);
  const abortRef = useRef<AbortController | null>(null);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(
    null
  );

  const { addInteraction, updateInteraction, updateOutput } = useFraudeStore();

  const interaction = useInteraction(interactionId);

  const promptUserConfirmation = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!interactionId) {
        resolve(false);
        return;
      }
      confirmationResolverRef.current = resolve;
      updateInteraction(interactionId, {
        pendingConfirmation: true,
        status: 3,
      });
    });
  };

  const handleQuery = useCallback(
    async (query: string) => {
      try {
        const id = useFraudeStore.getState().currentInteractionId;
        if (!id) {
          throw new Error("No interaction ID");
        }
        updateOutput("command", query);

        updateInteraction(id, { status: 1 });

        if (abortRef.current) {
          abortRef.current.abort();
        }
        abortRef.current = new AbortController();
        const signal = abortRef.current.signal;

        const tools = [
          createModifyProjectTool(promptUserConfirmation, signal),
          createSummarizeProjectTool(signal),
        ];

        const router = createRouterGraph(tools);

        await router.invoke(
          { messages: [new HumanMessage(query)] },
          { configurable: { thread_id: id } }
        );

        // Update status to done after router finishes (if it executes an action)
        // Note: The actions themselves might need to update status or we might need to listen to events.
        // For now, let's assume if the router finishes, we are done or waiting for confirmation (handled inside tools).
        // However, if the tool runs `langgraphModify`, it updates status internally?
        // `langgraphModify` returns a state, but doesn't strictly update the store status to "done" (2)
        // except at the end of the manual flow in the original code.
        // But `langgraphModify` itself calls `updateInteraction`?
        // Let's check `langgraphModify` again. It returns `finalState`. It does NOT call `updateInteraction` directly to set status to done.
        // The original `handleQuery` did that: `updateInteraction(id, { pendingConfirmation: false, status: 2 });`

        // So we should probably update status to 2 here after invoke.
        updateInteraction(id, { status: 2 });
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("[ERROR] ", error);
        }
      }
    },
    [addInteraction, updateInteraction]
  );

  const interrupt = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (interactionId) {
      updateInteraction(interactionId, { status: -1 });
    }
  }, [interactionId, updateInteraction]);

  const embedString = useCallback(async (query: string) => {
    return await qdrant.embed(query);
  }, []);

  const confirmModification = useCallback(
    (confirmed: boolean) => {
      if (confirmationResolverRef.current) {
        confirmationResolverRef.current(confirmed);
        confirmationResolverRef.current = null;
        if (interactionId) {
          updateInteraction(interactionId, { pendingConfirmation: false });
        }
      }
    },
    [interactionId, updateInteraction]
  );

  return {
    handleQuery,
    interrupt,
    embedString,
    confirmModification,
    pendingConfirmation: interaction?.pendingConfirmation || false,
    pendingChanges: interaction?.pendingChanges || [],
    interactionId,
  };
}

export default useOllamaClient;
