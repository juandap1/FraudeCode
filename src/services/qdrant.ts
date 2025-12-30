import { QdrantClient } from "@qdrant/js-client-rest";
import { pipeline } from "@huggingface/transformers";

const OLLAMA_EMBED_URL =
  process.env.OLLAMA_EMBED_URL || "http://localhost:11434/api/embeddings";
const EMBED_MODEL = process.env.EMBED_MODEL || "snowflake-arctic-embed:latest";
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";

export class QdrantCli {
  client: QdrantClient;
  reranker: any;

  constructor() {
    this.client = new QdrantClient({
      url: QDRANT_URL,
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

    const indices = [];
    const values = [];

    for (const [token, count] of Object.entries(counts)) {
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
      await this.client.getCollection(name);
      return { created: false };
    } catch (err: any) {
      if (err?.status === 404) {
        await this.client.createCollection(name, {
          vectors: {
            "arctic-dense": {
              size: 1024,
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
    await this.client.upsert(collectionName, {
      wait: true,
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
    const res = await fetch(OLLAMA_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
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
    const queryWithPrefix = `Represent this sentence for searching relevant passages: ${query}`;

    const denseQuery = await this.embed(queryWithPrefix);
    const sparseQuery = this.getSparseVector(query);

    const initialResults = await this.client.query(collectionName, {
      prefetch: [
        { query: denseQuery, using: "arctic-dense", limit: 20 },
        { query: sparseQuery, using: "code-sparse", limit: 20 },
      ],
      query: { fusion: "rrf" },
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
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const output = await this.reranker(query, {
          text_pair: chunk.payload.code || chunk.payload.rawDocument,
          topk: 1,
        });

        return {
          ...chunk,
          rerank_score: output[0].score,
        };
      })
    );

    return results
      .sort((a, b) => b.rerank_score - a.rerank_score)
      .slice(0, topK);
  }
}

const qdrant = new QdrantCli();
qdrant
  .init()
  .catch((err) => console.error("Failed to initialize Qdrant:", err));

export default qdrant;
