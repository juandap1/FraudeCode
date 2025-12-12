import React, { useState, useEffect, useCallback } from "react";
import { render, Text, Box } from "ink";

// --- Constants ---
const frames = ["-", "\\", "|", "/"];
const MODEL_NAME = "tinyllama:latest";
const OLLAMA_URL = "http://localhost:11434/api/chat";

// --- Custom Hook for Streaming ---
/**
 * Handles the connection to Ollama and streams the response.
 * @param userObjective The user's prompt.
 * @param systemPrompt The system instructions.
 * @param onChunk Callback to receive text chunks.
 * @returns { isStreaming: boolean, isError: boolean }
 */
const useOllamaStream = (
  userObjective: string,
  systemPrompt: string,
  onChunk: (chunk: string) => void
) => {
  const [isStreaming, setIsStreaming] = useState(true);
  const [isError, setIsError] = useState(false);

  // Memoize the function to prevent unnecessary re-runs
  const streamData = useCallback(async () => {
    const payload = {
      model: MODEL_NAME,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userObjective },
      ],
      options: { temperature: 0.6 },
    };

    try {
      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const jsonStrings = chunk.split("\n").filter((s) => s.trim() !== "");

        for (const jsonStr of jsonStrings) {
          try {
            const data = JSON.parse(jsonStr);
            const content = data.message?.content;

            if (content) {
              onChunk(content); // Update the component state
            }

            if (data.done) {
              reader.releaseLock();
              setIsStreaming(false); // Done streaming
              return;
            }
          } catch (e) {
            // Ignore malformed JSON chunks
          }
        }
      }
    } catch (error) {
      // In a real application, you might use an Ink error component here
      console.error("Failed to stream response:", error);
      setIsError(true);
      setIsStreaming(false);
    }
  }, [userObjective, systemPrompt, onChunk]);

  useEffect(() => {
    streamData();
  }, [streamData]);

  return { isStreaming, isError };
};

// --- Spinner Component ---
const Spinner = () => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prevIndex) => (prevIndex + 1) % frames.length);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return <Text>{frames[frameIndex]}</Text>;
};

// --- Main Ink Component ---
const OllamaStreamer = ({
  userObjective,
  systemPrompt,
}: {
  userObjective: string;
  systemPrompt: string;
}) => {
  const [streamedText, setStreamedText] = useState("");

  // Callback to update the streamed text state
  const handleChunk = useCallback((chunk: string) => {
    setStreamedText((prev) => prev + chunk);
  }, []);

  const { isStreaming, isError } = useOllamaStream(
    userObjective,
    systemPrompt,
    handleChunk
  );

  return (
    <Box flexDirection="column">
      {/* Line 1: Streamed Text */}
      <Text>Qwen-Chat &gt; {streamedText}</Text>

      {/* Line 2: Spinner/Status */}
      <Box>
        {isStreaming && (
          <Text color="yellow">
            <Spinner /> Loading...
          </Text>
        )}
        {!isStreaming && !isError && <Text color="green">✔ Done!</Text>}
        {isError && <Text color="red">❌ Error occurred.</Text>}
      </Box>
    </Box>
  );
};

// --- Execution ---

const plannerSystemPrompt = `
SYSTEM: You are an expert Software Engineer and Autonomous Agent Planner. 
Your output MUST be a detailed, structured, paragraph-by-paragraph plan.
`;

const userTask =
  "Explain the concept of speculative decoding in LLMs in a detailed, structured, paragraph-by-paragraph plan.";

// Use Ink's render function to start the CLI application
render(
  <OllamaStreamer userObjective={userTask} systemPrompt={plannerSystemPrompt} />
);
