import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { connect, type Connection, type Table } from "@lancedb/lancedb";
import path from "path";

// ============================================================================
// Embedding Service - Local embeddings with transformers.js + LanceDB storage
// ============================================================================

class EmbeddingService {
  private static instance: EmbeddingService;
  private extractor: FeatureExtractionPipeline | null = null;
  private db: Connection | null = null;
  private table: Table | null = null;
  private initPromise: Promise<void> | null = null;

  // Model: all-MiniLM-L6-v2 produces 384-dim embeddings
  private static MODEL_ID = "Xenova/all-MiniLM-L6-v2";
  private static TABLE_NAME = "facts";

  private constructor() {}

  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    // Initialize transformers.js pipeline
    this.extractor = await pipeline(
      "feature-extraction",
      EmbeddingService.MODEL_ID,
      {
        // Use ONNX runtime for Bun compatibility
        revision: "main",
      },
    );

    // Initialize LanceDB
    const dbPath = path.join(process.cwd(), ".fraude", "lancedb");
    this.db = await connect(dbPath);

    // Try to open existing table, or we'll create on first insert
    try {
      this.table = await this.db.openTable(EmbeddingService.TABLE_NAME);
    } catch {
      // Table doesn't exist yet, will create on first insert
      this.table = null;
    }
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<number[]> {
    await this.init();
    if (!this.extractor) throw new Error("Extractor not initialized");

    const output = await this.extractor(text, {
      pooling: "mean",
      normalize: true,
    });

    // Convert to regular array
    return Array.from(output.data as Float32Array);
  }

  /**
   * Store a fact with its embedding
   */
  async store(fact: {
    id: string;
    type: string;
    content: string;
    data?: string;
    timestamp: number;
    sessionId: string;
    confidence: number;
  }): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    const embedding = await this.embed(fact.content);

    const record = {
      id: fact.id,
      type: fact.type,
      content: fact.content,
      data: fact.data || "",
      timestamp: fact.timestamp,
      sessionId: fact.sessionId,
      confidence: fact.confidence,
      vector: embedding,
    };

    if (!this.table) {
      // Create table with first record
      this.table = await this.db.createTable(EmbeddingService.TABLE_NAME, [
        record,
      ]);
    } else {
      // Upsert: delete existing record with same ID before adding
      try {
        await this.table.delete(`id = '${fact.id}'`);
      } catch {
        // Record might not exist, continue with insert
      }
      await this.table.add([record]);
    }
  }

  /**
   * Search for similar facts using vector similarity
   */
  async search(
    query: string,
    limit: number = 5,
    threshold: number = 0.5,
  ): Promise<
    Array<{
      id: string;
      type: string;
      content: string;
      data: string;
      timestamp: number;
      sessionId: string;
      confidence: number;
      score: number;
    }>
  > {
    await this.init();
    if (!this.table) return [];

    const queryEmbedding = await this.embed(query);

    const results = await this.table
      .search(queryEmbedding)
      .limit(limit)
      .toArray();

    // Filter by threshold and map results
    return results
      .filter((r) => {
        // LanceDB returns _distance (lower is better) or _relevance (higher is better)
        const score = 1 - (r._distance || 0);
        return score >= threshold;
      })
      .map((r) => ({
        id: r.id as string,
        type: r.type as string,
        content: r.content as string,
        data: r.data as string,
        timestamp: r.timestamp as number,
        sessionId: r.sessionId as string,
        confidence: r.confidence as number,
        score: 1 - (r._distance || 0),
      }));
  }

  /**
   * Delete a fact by ID
   */
  async delete(id: string): Promise<void> {
    await this.init();
    if (!this.table) return;

    await this.table.delete(`id = '${id}'`);
  }

  /**
   * Clear all data (drops table)
   */
  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      await this.db.dropTable(EmbeddingService.TABLE_NAME);
      this.table = null;
    } catch {
      // Table might not exist
    }
  }

  /**
   * Get all facts (for migration/debugging)
   */
  async getAll(): Promise<
    Array<{
      id: string;
      type: string;
      content: string;
      data: string;
      timestamp: number;
    }>
  > {
    await this.init();
    if (!this.table) return [];

    const results = await this.table.query().toArray();
    return results.map((r) => ({
      id: r.id as string,
      type: r.type as string,
      content: r.content as string,
      data: r.data as string,
      timestamp: r.timestamp as number,
    }));
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    // LanceDB doesn't require explicit close, but reset state
    this.table = null;
    this.db = null;
    this.extractor = null;
    this.initPromise = null;
  }
}

export default EmbeddingService;
