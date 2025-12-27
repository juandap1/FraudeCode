import { ChromaClient } from "chromadb";

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

(async () => {
  try {
    console.log("🔍 Starting System Verification...\n");

    // 1. Check ChromaDB Connection
    console.log("1. Connecting to ChromaDB...");
    const client = new ChromaClient(); // Uses default http://localhost:8000
    const heartbeat = await client.heartbeat();
    console.log(`   ✅ Connected! Heartbeat: ${heartbeat}`);

    // 2. Check Embedding API (Ollama)
    console.log("\n2. Testing Ollama Embedding API...");
    const testEmbedding = await embed("Bun + Ollama embeddings are fast");
    if (testEmbedding && testEmbedding.length > 0) {
      console.log(
        `   ✅ Ollama Responding! Embedding Dimension: ${testEmbedding.length}`
      );
    } else {
      throw new Error("Ollama returned empty embedding");
    }

    // 3. Verify Collection Data
    console.log("\n3. Verifying 'sample' collection...");
    // We must provide the embedding function to query, as it's not stored in the server
    const collection = await client.getCollection({
      name: "sample",
      embeddingFunction: {
        generate: async (texts) => {
          return Promise.all(texts.map(embed));
        },
      },
    });

    const count = await collection.count();
    console.log(`   Collection 'sample' contains ${count} items.`);

    if (count > 0) {
      console.log("\n4. Performing semantic search test ('process data')...");
      const results = await collection.query({
        queryTexts: ["process data"],
        nResults: 2,
      });

      console.log("   --- Query Results ---");
      if (results.ids.length > 0 && results.ids[0].length > 0) {
        results.ids[0].forEach((id, index) => {
          const doc = results.documents?.[0][index];
          const meta = results.metadatas?.[0][index];
          console.log(`   Result ${index + 1}:`);
          console.log(`     ID: ${id}`);
          console.log(`     File: ${meta?.filePath || "unknown"}`);
          console.log(
            `     Snippet: "${doc?.substring(0, 50).replace(/\n/g, " ")}..."`
          );
        });
        console.log("\n   ✅ verification Successful!");
      } else {
        console.log("   ⚠️ No results found for query.");
      }
    } else {
      console.log(
        "\n   ⚠️ Collection is empty. Run 'analysis.ts' to index your code."
      );
    }
  } catch (e) {
    console.error("\n❌ Verification Failed:", e);
    process.exit(1);
  }
})();
