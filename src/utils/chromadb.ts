import { ChromaClient, type Collection } from "chromadb";

// Embedding Models
// bge-m3: Known for multi-functionality, multi-linguality (100+ languages), and multi-granularity (up to 8192 tokens).
// mxbai-embed-large: An excellent all-around performer that often matches or outperforms proprietary models on benchmarks.
// nomic-embed-text: A strong model, particularly for long-context tasks, with a large token context window.
// embeddinggemma: A lightweight and efficient model from Google, suitable for resource-constrained environments.

const ollamaEmbed = async (texts: string[]) => {
  const results = [];

  for (const text of texts) {
    const res = await fetch("http://localhost:11434/api/embed", {
      method: "POST",
      body: JSON.stringify({
        model: "snowflake-arctic-embed",
        input: text,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const data: any = await res.json();
    results.push(data.embedding);
  }

  return results;
};

class ChromaDB {
  client: ChromaClient;
  defaultCollection?: Collection;

  constructor() {
    this.client = new ChromaClient({
      path: "http://localhost:8000",
    });
  }

  async healthCheck() {
    const heartbeat = await this.client.heartbeat();
    console.log("Heartbeat:", heartbeat);
  }

  async createCollection(name: string) {
    this.defaultCollection = await this.client.getOrCreateCollection({
      name: name,
      embeddingFunction: {
        generate: ollamaEmbed,
      },
    });
  }
}

export default ChromaDB;
