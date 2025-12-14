// embed.ts
const OLLAMA_URL = "http://localhost:11434/api/embeddings";
const MODEL = "snowflake-arctic-embed:latest"; // or "mxbai-embed-large", etc.

async function embed(text: string): Promise<number[]> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
  }

  const data: any = await res.json();
  return data.embedding;
}

// Example usage
(async () => {
  const text = "Bun + Ollama embeddings are fast";
  const embedding = await embed(text);

  console.log("Embedding length:", embedding.length);
  console.log("First 5 values:", embedding.slice(0, 5));
})();
