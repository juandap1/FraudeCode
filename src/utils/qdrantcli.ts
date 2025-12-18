import { QdrantClient } from "@qdrant/js-client-rest";
import { pipeline } from "@huggingface/transformers";

// Embedding Models
// bge-m3: Known for multi-functionality, multi-linguality (100+ languages), and multi-granularity (up to 8192 tokens).
// mxbai-embed-large: An excellent all-around performer that often matches or outperforms proprietary models on benchmarks.
// nomic-embed-text: A strong model, particularly for long-context tasks, with a large token context window.
// embeddinggemma: A lightweight and efficient model from Google, suitable for resource-constrained environments.

const OLLAMA_URL = "http://localhost:11434/api/embeddings";
const MODEL = "snowflake-arctic-embed:latest";

class QdrantCli {
  client: QdrantClient;
  reranker: any;

  constructor() {
    this.client = new QdrantClient({
      url: "http://localhost:6333",
    });
  }

  async init() {
    this.reranker = await pipeline(
      "text-classification",
      "Xenova/bge-reranker-base",
      {
        revision: "main",
        dtype: "q8", // Keeps memory usage low
      }
    );
  }

  getSparseVector(text: string) {
    const tokens = text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2);
    const counts: Record<string, number> = {};

    tokens.forEach((t) => (counts[t] = (counts[t] || 0) + 1));

    // Map tokens to numerical indices (ideally using a consistent hashing function)
    const indices = [];
    const values = [];

    for (const [token, count] of Object.entries(counts)) {
      // Simple hash function for demonstration
      const index =
        Math.abs(
          token.split("").reduce((a, b) => {
            a = (a << 5) - a + b.charCodeAt(0);
            return a & a;
          }, 0)
        ) % 1000000;

      indices.push(index);
      values.push(count);
    }
    return { indices, values };
  }

  async getOrCreateCollection(name: string) {
    try {
      // Try to fetch first (cheap + fast)
      await this.client.getCollection(name);
      return { created: false };
    } catch (err: any) {
      // Only create if it truly does not exist
      if (err?.status === 404) {
        await this.client.createCollection(name, {
          vectors: {
            "arctic-dense": {
              size: 1024, // Change to 768 if using the 'm' version
              distance: "Cosine",
            },
          },
          sparse_vectors: {
            "code-sparse": {
              index: { on_disk: true },
            },
          },
        });
        return { created: true };
      }

      throw err;
    }
  }

  async upsertCollections(collectionName: string, points: any[]) {
    // console.log("Upserting");
    // console.log(points);
    await this.client.upsert(collectionName, {
      wait: true, // optional: wait for operation to complete
      points: points,
    });
  }

  async searchCollections(collectionName: string, query: any) {
    return await this.client.query(collectionName, {
      query: query,
      limit: 3,
      with_payload: true,
    });
  }

  async embed(text: string): Promise<number[]> {
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

  async hybridSearch(collectionName: string, query: any) {
    // IMPORTANT: Apply the prefix to the search query ONLY
    const queryWithPrefix = `Represent this sentence for searching relevant passages: ${query}`;

    const denseQuery = await this.embed(queryWithPrefix);
    const sparseQuery = this.getSparseVector(query);

    const initialResults = await this.client.query(collectionName, {
      prefetch: [
        { query: denseQuery, using: "arctic-dense", limit: 20 },
        { query: sparseQuery, using: "code-sparse", limit: 20 },
      ],
      query: { fusion: "rrf" }, // Rank Reciprocal Fusion
      limit: 50,
      with_payload: true,
    });

    const finalContext = await this.rerankResults(
      query,
      initialResults.points,
      5
    );
    return finalContext;
  }

  async rerankResults(query: string, chunks: any[], topK: number = 5) {
    // 1. Prepare pairs for the model
    // The model expects an array of pairs: [query, document]
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        // Note: Transformers.js handles concatenation internally
        const output = await this.reranker(query, {
          text_pair: chunk.payload.code,
          topk: 1, // We just want the 'RELEVANT' score
        });

        return {
          ...chunk,
          rerank_score: output[0].score,
        };
      })
    );

    // 2. Sort by the new reranker score (descending)
    return results
      .sort((a, b) => b.rerank_score - a.rerank_score)
      .slice(0, topK);
  }
}

export default QdrantCli;
