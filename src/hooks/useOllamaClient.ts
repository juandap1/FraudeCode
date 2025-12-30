import { useCallback, useRef, useEffect, useState } from "react";
import summarizeProject from "../core/actions/summarize_project";
import qdrant from "../services/qdrant";
import type { PendingChange } from "../types/state";
import langgraphModify from "../core/actions/langgraph_modify";
import { thinkerModel, coderModel } from "../services/llm";
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

        if (query.trim() === "/summarize") {
          await summarizeProject(coderModel, signal);
          updateInteraction(id, { status: 2 });
        } else if (query.trim().startsWith("/modify")) {
          const prompt = query.trim().split(" ").slice(1).join(" ") || "";
          if (prompt.length === 0) {
            updateInteraction(id, { status: 2 });
            updateOutput("log", "No prompt provided");
            return;
          } else {
            await langgraphModify(
              prompt,
              thinkerModel,
              coderModel,
              promptUserConfirmation,
              signal
            );
            updateInteraction(id, { pendingConfirmation: false, status: 2 });
          }
        } else {
          updateInteraction(id, { status: 2 });
          updateOutput("log", "Command not found");
        }
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
