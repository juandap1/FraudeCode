import { useCallback, useRef, useState } from "react";

import type { PendingChange } from "../types/state";

import { createModifyProjectTool } from "../core/tools/ModifyProjectTool";
import { createSummarizeProjectTool } from "../core/tools/SummarizeProjectTool";
import { createRouterGraph } from "../core/agent/router";
import { HumanMessage } from "@langchain/core/messages";
import {
  useFraudeStore,
  useInteraction,
  initSignal,
} from "../store/useFraudeStore";
import log from "../utils/logger";

export interface OllamaCLI {
  handleQuery: (query: string) => Promise<void>;
  confirmModification: (confirmed: boolean) => void;
  pendingConfirmation: boolean;
  pendingChanges: PendingChange[];
  interactionId: string | null;
}

export function useOllamaClient(initialId: string | null = null): OllamaCLI {
  const [interactionId, setInteractionId] = useState<string | null>(initialId);
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

        initSignal();

        const tools = [
          createModifyProjectTool(promptUserConfirmation),
          createSummarizeProjectTool(),
        ];

        const router = createRouterGraph(tools);

        await router.invoke(
          { messages: [new HumanMessage(query)] },
          { configurable: { thread_id: id } }
        );

        updateInteraction(id, { status: 2 });
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("[ERROR] ", error);
        }
      }
    },
    [addInteraction, updateInteraction]
  );

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
    confirmModification,
    pendingConfirmation: interaction?.pendingConfirmation || false,
    pendingChanges: interaction?.pendingChanges || [],
    interactionId,
  };
}

export default useOllamaClient;
