import { useState, useCallback, useRef, useEffect } from "react";
import summarizeProject from "./actions/summarize_project";
import Neo4jClient from "./neo4jcli";
import QdrantCli from "./qdrantcli";
import modifyProject from "./actions/modify_project";
import langgraphModify from "./actions/langgraph_modify";

const neo4j = new Neo4jClient();
const qdrant = new QdrantCli();

// Initialize Qdrant reranker once
qdrant
  .init()
  .catch((err) => console.error("Failed to initialize Qdrant:", err));

const OLLAMA_URL = "http://localhost:11434";

export type TokenUsage = {
  total: number;
  prompt: number;
  completion: number;
};

export interface OllamaCLI {
  streamedText: string;
  status: number; // 0 = idle, 1 = loading, 2 = done, -1 = interrupted, 3 = awaiting confirmation
  tokenUsage: TokenUsage;
  handleQuery: (query: string) => Promise<void>;
  interrupt: () => void;
  embedString: (query: string) => Promise<number[]>;
  confirmModification: (confirmed: boolean) => void;
  pendingConfirmation: boolean;
  neo4j: Neo4jClient;
  qdrant: QdrantCli;
}

export function useOllamaClient(model: string): OllamaCLI {
  const [streamedText, setStreamedText] = useState("");
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

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const handleQuery = useCallback(
    async (query: string) => {
      setStatus(1);
      setStreamedText("");

      if (query.trim() == "/summarize") {
        await summarizeProject(neo4j, qdrant, ollamaStreamQuery);
      } else if (query.trim().startsWith("/modify")) {
        let prompt = query.trim().split(" ").slice(1).join(" ") || "";
        if (prompt.length == 0) {
          invalidPromptError("No prompt provided");
          return;
        } else {
          // Create a promise that will be resolved when user confirms/rejects
          const promptUserConfirmation = (): Promise<boolean> => {
            return new Promise((resolve) => {
              confirmationResolverRef.current = resolve;
              setPendingConfirmation(true);
              setStatus(3); // awaiting confirmation
            });
          };

          await langgraphModify(
            prompt,
            neo4j,
            qdrant,
            setStreamedText,
            promptUserConfirmation
          );
          setPendingConfirmation(false);
          setStatus(2);
        }
      } else {
        invalidPromptError("Command not found");
      }
    },
    [model]
  );

  const ollamaStreamQuery = useCallback(
    async (payload: any) => {
      try {
        if (abortRef.current) {
          abortRef.current.abort();
        }
        abortRef.current = new AbortController();

        let modifiedPayload = payload;
        // DEFAULTS
        modifiedPayload.stream = true;
        if (!payload.model) modifiedPayload.model = model;

        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(modifiedPayload),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
          if (abortRef.current?.signal.aborted) {
            reader.cancel();
            return;
          }
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const jsonStrings = chunk.split("\n").filter((s) => s.trim() !== "");

          for (const jsonStr of jsonStrings) {
            try {
              const data = JSON.parse(jsonStr);
              const content = data.message?.content;

              if (content) {
                setStreamedText((prev) => prev + content);
              }

              if (data.done) {
                let prompt = data?.prompt_eval_count || 0;
                let completion = data?.eval_count || 0;
                let total = prompt + completion;
                setTokenUsage({
                  total,
                  prompt,
                  completion,
                });
                break;
              }
            } catch (e) {
              // Ignore malformed JSON chunks
            }
          }
        }
        setStatus(2);
      } catch (error: any) {
        if (error.name === "AbortError") {
          return;
        }
        console.error("Failed to stream response:", error);
        setStatus(2);
      }
    },
    [model]
  );

  const ollamaReturnQuery = useCallback(
    async (payload: any) => {
      try {
        if (abortRef.current) {
          abortRef.current.abort();
        }
        abortRef.current = new AbortController();

        let modifiedPayload = payload;
        // DEFAULTS
        modifiedPayload.stream = false;
        if (!payload.model) modifiedPayload.model = model;

        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(modifiedPayload),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = (await response.json()) as any;
        const content = data.message?.content || "";
        let prompt = data?.prompt_eval_count || 0;
        let completion = data?.eval_count || 0;
        let total = prompt + completion;
        setTokenUsage({
          total,
          prompt,
          completion,
        });
        return content;
      } catch (error: any) {
        if (error.name === "AbortError") {
          return;
        }
        console.error("Failed to query Ollama:", error);
        setStatus(2);
      }
    },
    [model]
  );

  const invalidPromptError = useCallback((message?: string) => {
    setStatus(2);
    setStreamedText(message || "Command not found");
  }, []);

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
    streamedText,
    status,
    handleQuery,
    tokenUsage,
    interrupt,
    embedString,
    confirmModification,
    pendingConfirmation,
    neo4j,
    qdrant,
  };
}

export default useOllamaClient;
