import { useState, useCallback, useRef, useEffect } from "react";
import summarizeProject from "./actions/summarize_project";
import Neo4jClient from "./neo4jcli";
import QdrantCli from "./qdrantcli";

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
  status: number; // 0 = idle, 1 = loading, 2 = done, -1 = interrupted
  tokenUsage: TokenUsage;
  handleQuery: (query: string) => Promise<void>;
  interrupt: () => void;
  embedString: (query: string) => Promise<number[]>;
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

  const handleQuery = useCallback(
    async (query: string) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      setStatus(1);
      setStreamedText("");

      if (query.trim() == "/summarize") {
        const prompt = await summarizeProject(neo4j, qdrant);
        const payload = {
          model,
          stream: true,
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0.6 },
        };
        await ollamaQuery(payload, abortRef);
      } else {
        notFoundError();
      }
    },
    [model]
  );

  const ollamaQuery = useCallback(
    async (payload: any, abortRef: any) => {
      try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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

  const notFoundError = useCallback(() => {
    setStatus(2);
    setStreamedText("Command not found");
  }, []);

  const interrupt = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setStatus(-1);
  }, []);

  const embedString = useCallback(async (query: string) => {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "snowflake-arctic-embed:latest",
        prompt: query,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    }

    const data: any = await res.json();
    console.log(data);
    return data.embedding;
  }, []);

  return {
    streamedText,
    status,
    handleQuery,
    tokenUsage,
    interrupt,
    embedString,
    neo4j,
    qdrant,
  };
}

export default useOllamaClient;
