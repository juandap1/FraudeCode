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
  getSignal,
} from "../store/useFraudeStore";
import log from "../utils/logger";

export interface OllamaCLI {
  handleQuery: (query: string) => Promise<void>;
  pendingChanges: PendingChange[];
  interactionId: string | null;
}

export function useOllamaClient(initialId: string | null = null): OllamaCLI {
  const [interactionId, setInteractionId] = useState<string | null>(initialId);
  const {
    addInteraction,
    updateInteraction,
    updateOutput,
    promptUserConfirmation,
  } = useFraudeStore();

  const interaction = useInteraction(interactionId);

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
          {
            configurable: { thread_id: id },
            signal: getSignal(),
          }
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

  return {
    handleQuery,
    pendingChanges: interaction?.pendingChanges || [],
    interactionId,
  };
}

export default useOllamaClient;
