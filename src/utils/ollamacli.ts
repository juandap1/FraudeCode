import { useState } from "react";

const OLLAMA_URL = "http://localhost:11434/api/chat";
class OllamaCLI {
  private model: string;
  private context: { role: string; content: string }[];
  private onChunk: (chunk: string) => void;
  private setWorking: (status: boolean) => void;

  constructor(
    model: string,
    onChunk: (chunk: string) => void,
    setWorking: (status: boolean) => void
  ) {
    this.model = model;
    this.context = [];
    this.onChunk = onChunk;
    this.setWorking = setWorking;
  }

  async completionQuery(query: string) {
    this.setWorking(true);
    const payload = {
      model: this.model,
      stream: true,
      messages: [
        // { role: "system", content: systemPrompt },
        { role: "user", content: query },
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
              this.onChunk(content);
            }

            if (data.done) {
              reader.releaseLock();
              break;
            }
          } catch (e) {
            // Ignore malformed JSON chunks
          }
        }
      }
      this.setWorking(false);
    } catch (error) {
      console.error("Failed to stream response:", error);
      this.setWorking(false);
    }
  }
}

export default OllamaCLI;
