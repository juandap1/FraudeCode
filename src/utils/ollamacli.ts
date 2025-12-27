import { useState, useCallback, useRef, useEffect } from "react";
import summarizeProject from "./actions/summarize_project";
import Neo4jClient from "./neo4jcli";
import QdrantCli from "./qdrantcli";
import type { PendingChange } from "./actions/langgraph_modify";
import langgraphModify from "./actions/langgraph_modify";
import { ChatOllama } from "@langchain/ollama";

const neo4j = new Neo4jClient();
const qdrant = new QdrantCli();
// Initialize Qdrant reranker once
qdrant
  .init()
  .catch((err) => console.error("Failed to initialize Qdrant:", err));

const OLLAMA_URL = "http://localhost:11434";
const thinkerModel = new ChatOllama({
  model: "qwen3:8b",
  baseUrl: OLLAMA_URL,
  temperature: 0,
});

const coderModel = new ChatOllama({
  model: "llama3.1:latest",
  baseUrl: OLLAMA_URL,
  temperature: 0,
});

export type TokenUsage = {
  total: number;
  prompt: number;
  completion: number;
};

export type OutputItemType =
  | "log"
  | "markdown"
  | "diff"
  | "confirmation"
  | "command";

export interface OutputItem {
  id: string;
  type: OutputItemType;
  content: string;
  title?: string;
  changes?: PendingChange[];
}

export interface OllamaCLI {
  outputItems: OutputItem[];
  status: number; // 0 = idle, 1 = loading, 2 = done, -1 = interrupted, 3 = awaiting confirmation
  tokenUsage: TokenUsage;
  handleQuery: (query: string) => Promise<void>;
  interrupt: () => void;
  embedString: (query: string) => Promise<number[]>;
  confirmModification: (confirmed: boolean) => void;
  pendingConfirmation: boolean;
  pendingChanges: PendingChange[];
  updateOutput: (
    type: OutputItemType,
    content: string,
    title?: string,
    changes?: PendingChange[]
  ) => void;
  neo4j: Neo4jClient;
  qdrant: QdrantCli;
}

export function useOllamaClient(model: string): OllamaCLI {
  const [outputItems, setOutputItems] = useState<OutputItem[]>([]);
  const itemsRef = useRef<OutputItem[]>([]);
  const [status, setStatus] = useState(0);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    total: 0,
    prompt: 0,
    completion: 0,
  });
  const abortRef = useRef<AbortController | null>(null);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(
    null
  );
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  const lastUpdateRef = useRef<number>(0);

  // Helper to add a new output item
  const updateOutput = useCallback(
    (
      type: OutputItemType,
      content: string,
      title?: string,
      changes?: PendingChange[]
    ) => {
      setOutputItems((prev) => {
        const last = prev[prev.length - 1];
        // If we have a title, and it matches the last item's title and type,
        // we replace the content (useful for streaming or updating specific sections).
        // If no title is provided, we treat it as a new log entry.
        if (last && last.type === type && last.type !== "log") {
          return [...prev.slice(0, -1), { ...last, content, changes }];
        } else {
          return [
            ...prev,
            { id: crypto.randomUUID(), type, content, title, changes },
          ];
        }
      });
      lastUpdateRef.current = Date.now();
    },
    []
  );

  // Create a promise that will be resolved when user confirms/rejects
  const promptUserConfirmation = (): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmationResolverRef.current = resolve;
      setPendingConfirmation(true);
      setStatus(3); // awaiting confirmation
    });
  };

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const handleQuery = useCallback(
    async (query: string) => {
      try {
        setStatus(1);
        itemsRef.current = []; // Clear previous output
        setOutputItems([]);
        updateOutput("command", query);

        if (query.trim() == "/summarize") {
          // await summarizeProject(neo4j, qdrant, ollamaStreamQuery);
          setStatus(2);
        } else if (query.trim().startsWith("/modify")) {
          let prompt = query.trim().split(" ").slice(1).join(" ") || "";
          if (prompt.length == 0) {
            invalidPromptError("No prompt provided");
            return;
          } else {
            if (abortRef.current) {
              abortRef.current.abort();
            }
            abortRef.current = new AbortController();

            await langgraphModify(
              prompt,
              neo4j,
              qdrant,
              thinkerModel,
              coderModel,
              updateOutput,
              promptUserConfirmation,
              setPendingChanges,
              abortRef.current.signal
            );
            setPendingConfirmation(false);
            setStatus(2);
          }
        } else {
          invalidPromptError("Command not found");
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("[ERROR] ", error);
        }
      }
    },
    [model, updateOutput]
  );

  const invalidPromptError = useCallback(
    (message?: string) => {
      setStatus(2);
      updateOutput("log", message || "Command not found");
    },
    [updateOutput]
  );

  const interrupt = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus(-1);
  }, []);

  const embedString = useCallback(async (query: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "snowflake-arctic-embed:latest",
        prompt: query,
      }),
      signal: abortRef.current.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    }

    const data: any = await res.json();
    console.log(data);
    return data.embedding;
  }, []);

  const confirmModification = useCallback((confirmed: boolean) => {
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current(confirmed);
      confirmationResolverRef.current = null;
      setPendingConfirmation(false);
    }
  }, []);

  return {
    outputItems,
    status,
    handleQuery,
    tokenUsage,
    interrupt,
    embedString,
    confirmModification,
    pendingConfirmation,
    pendingChanges,
    updateOutput,
    neo4j,
    qdrant,
  };
}

export default useOllamaClient;
