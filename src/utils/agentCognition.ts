import { Database, Connection, QueryResult, PreparedStatement } from "kuzu";
import path from "path";
import fs from "fs";
import type { ModelMessage } from "ai";
import EmbeddingService from "@/services/embeddingService";
import log from "./logger";

// ============================================================================
// Types
// ============================================================================

export interface Fact {
  id: string;
  type: "fact" | "decision" | "concept" | "reference" | "summary";
  content: string;
  data?: {
    file?: string;
    function?: string;
    symbol?: string;
    [key: string]: unknown;
  };
  timestamp: number;
  sessionId: string;
  confidence: number;
  validated?: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: "file_missing" | "code_changed" | "stale" | "conflict";
  suggestion?: "delete" | "update" | "keep";
}

// ============================================================================
// AgentCognition - Consolidated Knowledge Management
// ============================================================================

class AgentCognition {
  private static instance: AgentCognition;
  private db: Database | null = null;
  private conn: Connection | null = null;
  private dbPath: string;
  private initPromise: Promise<void> | null = null;
  private sessionId: string;
  private embeddings: EmbeddingService;

  // Staleness threshold: 7 days
  private static STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

  private constructor() {
    this.dbPath = path.join(process.cwd(), ".fraude", "kuzu");
    this.sessionId = crypto.randomUUID();
    this.embeddings = EmbeddingService.getInstance();
  }

  static getInstance(): AgentCognition {
    if (!AgentCognition.instance) {
      AgentCognition.instance = new AgentCognition();
    }
    return AgentCognition.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.ensureDirectory();
      this.db = new Database(this.dbPath);
      this.conn = new Connection(this.db);
      await this.initSchema();
    })();

    return this.initPromise;
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private async initSchema(): Promise<void> {
    if (!this.conn) throw new Error("Connection not initialized");

    try {
      // Create Fact node table
      await this.conn.query(`
        CREATE NODE TABLE IF NOT EXISTS Fact (
          id STRING,
          type STRING,
          content STRING,
          data STRING,
          timestamp INT64,
          sessionId STRING,
          confidence DOUBLE,
          validated INT64,
          PRIMARY KEY (id)
        )
      `);

      // Create relationship table
      await this.conn.query(`
        CREATE REL TABLE IF NOT EXISTS RELATED_TO (
          FROM Fact TO Fact,
          relation STRING,
          weight DOUBLE
        )
      `);
    } catch (e: unknown) {
      // Tables may already exist, ignore errors
    }
  }

  // ============================================================================
  // Graph Operations
  // ============================================================================

  private async execute(
    cypher: string,
    params: Record<string, any> = {},
  ): Promise<QueryResult> {
    await this.init();
    if (!this.conn) throw new Error("Connection not initialized");

    const stmt: PreparedStatement = await this.conn.prepare(cypher);
    if (!stmt.isSuccess()) {
      throw new Error(`Failed to prepare statement: ${stmt.getErrorMessage()}`);
    }
    const result = await this.conn.execute(stmt, params);
    if (Array.isArray(result)) {
      return result[0] as QueryResult;
    }
    return result as QueryResult;
  }

  async addFact(
    fact: Omit<Fact, "id" | "timestamp" | "sessionId">,
  ): Promise<string> {
    // Deduplication: Check if a fact with same type+content already exists
    const existing = await this.findDuplicate(fact.type, fact.content);
    if (existing) {
      // Update timestamp to keep it fresh, but don't create duplicate
      await this.execute(
        `
        MATCH (f:Fact {id: $id})
        SET f.validated = $validated,
            f.confidence = CASE WHEN $confidence > f.confidence THEN $confidence ELSE f.confidence END
        RETURN f
      `,
        {
          id: existing.id,
          validated: Date.now(),
          confidence: fact.confidence,
        },
      );
      return existing.id;
    }

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const dataStr = JSON.stringify(fact.data || {});

    await this.execute(
      `
      CREATE (f:Fact {
        id: $id,
        type: $type,
        content: $content,
        data: $data,
        timestamp: $timestamp,
        sessionId: $sessionId,
        confidence: $confidence,
        validated: $validated
      })
      RETURN f
    `,
      {
        id,
        type: fact.type,
        content: fact.content,
        data: dataStr,
        timestamp,
        sessionId: this.sessionId,
        confidence: fact.confidence,
        validated: timestamp,
      },
    );

    // Also store in vector DB for semantic search
    try {
      await this.embeddings.store({
        id,
        type: fact.type,
        content: fact.content,
        data: dataStr,
        timestamp,
        sessionId: this.sessionId,
        confidence: fact.confidence,
      });
    } catch (e) {
      // Embedding storage is optional, don't fail if it errors
    }

    return id;
  }

  private async findDuplicate(
    type: Fact["type"],
    content: string,
  ): Promise<Fact | null> {
    // 1. Exact string match (Fast path)
    try {
      const result = await this.execute(
        `
        MATCH (f:Fact {type: $type})
        WHERE f.content = $content
        RETURN f
        LIMIT 1
      `,
        { type, content },
      );
      const rows = await result.getAll();
      if (rows.length > 0) {
        return this.parseFact(
          (rows[0] as Record<string, unknown>).f as Record<string, unknown>,
        );
      }
    } catch (e) {}

    // 2. Semantic similarity check (Vector DB)
    // Use a high threshold (0.92) to establish "essentially the same meaning"
    try {
      const semanticResults = await this.embeddings.search(content, 3, 0.92);
      const match = semanticResults.find((r) => r.type === type);

      if (match) {
        // Fetch full fact from Graph DB to get all fields (e.g. validated status)
        const result = await this.execute(
          `
          MATCH (f:Fact {id: $id})
          RETURN f
        `,
          { id: match.id },
        );
        const rows = await result.getAll();
        if (rows.length > 0) {
          return this.parseFact(
            (rows[0] as Record<string, unknown>).f as Record<string, unknown>,
          );
        }
      }
    } catch (e) {}

    return null;
  }

  async addRelation(
    sourceId: string,
    targetId: string,
    relation: string,
    weight: number = 1.0,
  ): Promise<void> {
    await this.execute(
      `
      MATCH (a:Fact {id: $sourceId})
      MATCH (b:Fact {id: $targetId})
      MERGE (a)-[r:RELATED_TO {relation: $relation}]->(b)
      SET r.weight = $weight
      RETURN r
    `,
      { sourceId, targetId, relation, weight },
    );
  }

  async query(
    cypher: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown[]> {
    const result = await this.execute(cypher, params);
    return result.getAll();
  }

  // ============================================================================
  // Retrieval
  // ============================================================================

  async findByType(type: Fact["type"]): Promise<Fact[]> {
    const result = await this.execute(`MATCH (f:Fact {type: $type}) RETURN f`, {
      type,
    });
    const rows = await result.getAll();
    return rows.map((row: Record<string, unknown>) =>
      this.parseFact(row.f as Record<string, unknown>),
    );
  }

  async findRelated(factId: string, depth: number = 1): Promise<Fact[]> {
    const result = await this.execute(
      `
      MATCH (start:Fact {id: $factId})-[:RELATED_TO*1..${depth}]->(related:Fact)
      RETURN DISTINCT related
    `,
      { factId },
    );
    const rows = await result.getAll();
    return rows.map((row: Record<string, unknown>) =>
      this.parseFact(row.related as Record<string, unknown>),
    );
  }

  async searchByContent(query: string, limit: number = 10): Promise<Fact[]> {
    // Simple contains search - could be enhanced with embeddings later
    const result = await this.execute(
      `
      MATCH (f:Fact)
      WHERE f.content CONTAINS $query
      RETURN f
      LIMIT $limit
    `,
      { query, limit },
    );
    const rows = await result.getAll();
    return rows.map((row: Record<string, unknown>) =>
      this.parseFact(row.f as Record<string, unknown>),
    );
  }

  async getPrimingContext(): Promise<string> {
    // Get key project knowledge: recent summaries and high-confidence decisions
    const summaries = await this.findByType("summary");
    const decisions = await this.findByType("decision");

    const validSummaries = await this.filterValid(summaries.slice(0, 3));
    const validDecisions = await this.filterValid(decisions.slice(0, 5));

    const parts: string[] = [];

    if (validSummaries.length > 0) {
      parts.push("## Previous Session Context");
      validSummaries.forEach((s) => parts.push(`- ${s.content}`));
    }

    if (validDecisions.length > 0) {
      parts.push("\n## Project Decisions");
      validDecisions.forEach((d) => parts.push(`- ${d.content}`));
    }

    return parts.join("\n");
  }

  async retrieveRelevant(query: string, limit: number = 5): Promise<Fact[]> {
    // Hybrid search: combine vector similarity + graph relationships
    const scored = new Map<string, { fact: Fact; score: number }>();

    // Phase 1: Vector search for semantic similarity
    try {
      const semanticResults = await this.embeddings.search(
        query,
        limit * 2,
        0.3,
      );
      for (const r of semanticResults) {
        const fact: Fact = {
          id: r.id,
          type: r.type as Fact["type"],
          content: r.content,
          data: r.data ? JSON.parse(r.data) : undefined,
          timestamp: r.timestamp,
          sessionId: r.sessionId,
          confidence: r.confidence,
        };
        // Vector score: similarity (0-1) weighted heavily
        scored.set(r.id, { fact, score: r.score * 0.7 });
      }
    } catch (e) {
      // Continue with graph-only if embeddings fail
    }

    // Phase 2: Graph expansion - find related facts for top vector hits
    const topVectorIds = [...scored.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([id]) => id);

    for (const factId of topVectorIds) {
      try {
        const related = await this.findRelated(factId, 1);
        for (const rel of related) {
          const existing = scored.get(rel.id);
          if (existing) {
            // Boost score for facts found via both vector AND graph
            existing.score += 0.2;
          } else {
            // Add graph-discovered facts with lower base score
            scored.set(rel.id, { fact: rel, score: 0.3 });
          }
        }
      } catch (e) {
        // Continue if graph query fails
      }
    }

    // Phase 3: Text fallback if no results yet
    if (scored.size === 0) {
      const textResults = await this.searchByContent(query, limit * 2);
      for (const fact of textResults) {
        scored.set(fact.id, { fact, score: 0.4 });
      }
    }

    // Phase 4: Rank, validate, and return
    const ranked = [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 2)
      .map((s) => s.fact);

    return this.filterValid(ranked.slice(0, limit));
  }

  private parseFact(raw: Record<string, unknown>): Fact {
    return {
      id: raw.id as string,
      type: raw.type as Fact["type"],
      content: raw.content as string,
      data: raw.data ? JSON.parse(raw.data as string) : undefined,
      timestamp: raw.timestamp as number,
      sessionId: raw.sessionId as string,
      confidence: raw.confidence as number,
      validated: raw.validated as number,
    };
  }

  // ============================================================================
  // Validation
  // ============================================================================

  async validateFact(fact: Fact): Promise<ValidationResult> {
    // 1. File reference check
    if (fact.data?.file) {
      const filePath = path.isAbsolute(fact.data.file)
        ? fact.data.file
        : path.join(process.cwd(), fact.data.file);

      if (!fs.existsSync(filePath)) {
        return { valid: false, reason: "file_missing", suggestion: "delete" };
      }
    }

    // 2. Code presence check (function/symbol)
    if (fact.data?.function || fact.data?.symbol) {
      const exists = await this.checkCodeExists(fact.data);
      if (!exists) {
        return { valid: false, reason: "code_changed", suggestion: "delete" };
      }
    }

    // 3. Staleness check
    const age = Date.now() - fact.timestamp;
    if (age > AgentCognition.STALE_THRESHOLD_MS) {
      // If it references files, check if they changed
      if (fact.data?.file) {
        const filePath = path.isAbsolute(fact.data.file)
          ? fact.data.file
          : path.join(process.cwd(), fact.data.file);

        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs > fact.timestamp) {
            return { valid: false, reason: "stale", suggestion: "update" };
          }
        }
      }
      // Generic staleness for old facts without file refs
      if (age > AgentCognition.STALE_THRESHOLD_MS * 4) {
        return { valid: false, reason: "stale", suggestion: "update" };
      }
    }

    return { valid: true };
  }

  private async checkCodeExists(data: Fact["data"]): Promise<boolean> {
    if (!data?.file) return true;

    const filePath = path.isAbsolute(data.file)
      ? data.file
      : path.join(process.cwd(), data.file);

    if (!fs.existsSync(filePath)) return false;

    // Check if function/symbol exists in file
    const target = data.function || data.symbol;
    if (!target) return true;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      // Simple check: does the symbol name appear in the file?
      return content.includes(target);
    } catch {
      return false;
    }
  }

  async filterValid(facts: Fact[]): Promise<Fact[]> {
    const results: Fact[] = [];
    for (const fact of facts) {
      const validation = await this.validateFact(fact);
      if (validation.valid) {
        results.push(fact);
      } else if (validation.suggestion === "delete") {
        await this.deleteFact(fact.id);
      }
    }
    return results;
  }

  async deleteFact(id: string): Promise<void> {
    await this.execute(`MATCH (f:Fact {id: $id}) DELETE f`, { id });
    try {
      await this.embeddings.delete(id);
    } catch (e) {
      // Vector deletion is best-effort, don't fail if it errors
    }
  }

  async pruneStale(): Promise<number> {
    const allFacts = await this.query(`MATCH (f:Fact) RETURN f`);
    let pruned = 0;

    for (const row of allFacts) {
      const fact = this.parseFact(
        (row as Record<string, unknown>).f as Record<string, unknown>,
      );
      const validation = await this.validateFact(fact);
      if (!validation.valid && validation.suggestion === "delete") {
        await this.deleteFact(fact.id);
        pruned++;
      }
    }

    return pruned;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  async summarizeSession(messages: ModelMessage[]): Promise<string> {
    // Simple extraction: look for key patterns in messages
    // Could be enhanced with LLM-based summarization
    const userMessages = messages
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .filter((c) => c.length > 0);

    if (userMessages.length === 0) return "";

    // Create a simple summary from first and last user messages
    const first = userMessages[0] ?? "";
    const last = userMessages[userMessages.length - 1] ?? "";

    return `Session covered: "${first.slice(0, 100)}"${userMessages.length > 1 ? ` → "${last.slice(0, 100)}"` : ""}`;
  }

  async extractFromSession(messages: ModelMessage[]): Promise<Fact[]> {
    log("Extracting facts from session");
    // Extract facts from session using LLM-based analysis
    const recentMessages = messages.slice(-15);
    const conversationText = recentMessages
      .map((m) => this.formatMessageForExtraction(m))
      .join("\n\n---\n\n");

    const assistantMessages = messages
      .filter((m) => m.role === "assistant")
      .map((m) => (typeof m.content === "string" ? m.content : ""));

    if (conversationText.length < 50 && assistantMessages.length === 0)
      return [];

    // Try LLM-based extraction first
    try {
      if (conversationText.length >= 50) {
        const extracted = await this.extractWithLLM(conversationText);
        if (extracted.length > 0) return extracted;
      }
    } catch (e) {}

    // Fallback: regex-based extraction
    return this.extractWithPatterns(assistantMessages);
  }

  private formatMessageForExtraction(m: ModelMessage): string {
    const role = m.role.toUpperCase();
    log(JSON.stringify(m, null, 2));
    let content = "";

    // Handle Assistant messages (Text + Reasoning + Tool Calls)
    if (m.role === "assistant") {
      const textContent =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .map((c: any) => {
                  if (c.type === "text" || c.type === "reasoning")
                    return c.text;
                  else if (c.type === "tool-call") {
                    const toolName = c.toolName;
                    const args = JSON.stringify(c.input);
                    return `Tool Call: ${toolName}(${args})`;
                  }
                  return null;
                })
                .filter((c) => c !== null)
                .join("\n")
            : "";
      content = textContent;
    }
    // Handle Tool messages (Results)
    else if (m.role === "tool") {
      if (Array.isArray(m.content)) {
        content = m.content
          .map((c: any) => {
            const resultStr =
              typeof c.output === "string"
                ? c.output
                : JSON.stringify(c.output) || "";
            return `Tool Result (${c.toolName}): ${resultStr.slice(0, 500)}${resultStr.length > 500 ? "..." : ""}`;
          })
          .join("\n");
      } else {
        content = JSON.stringify(m.content);
      }
    }
    // Handle User messages
    else {
      if (typeof m.content === "string") {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        content = m.content
          .map((c: any) => (c.type === "text" ? c.text : `[${c.type} content]`))
          .join("\n");
      } else {
        content = "[Complex Content]";
      }
    }

    return `${role}:\n${content}`;
  }

  private async extractWithLLM(content: string): Promise<Fact[]> {
    const { extractFacts } = await import("@/agent/subagents/extractionAgent");

    const extracted = await extractFacts(content, this.sessionId);
    log("Extracted facts: " + JSON.stringify(extracted, null, 2));

    return extracted.map((f) => ({
      ...f,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    })) as Fact[];
  }

  private extractWithPatterns(assistantMessages: string[]): Fact[] {
    const facts: Fact[] = [];

    for (const content of assistantMessages) {
      const decisionPatterns = [
        /(?:decided|choosing|using|implementing)\s+([^.]+)/gi,
        /(?:will use|should use|recommend)\s+([^.]+)/gi,
      ];

      for (const pattern of decisionPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const captured = match[1];
          if (captured && captured.length > 10 && captured.length < 200) {
            facts.push({
              id: crypto.randomUUID(),
              type: "decision",
              content: captured.trim(),
              timestamp: Date.now(),
              sessionId: this.sessionId,
              confidence: 0.7,
            });
          }
        }
      }

      // Look for fact patterns
      const factPatterns = [
        /(?:the project|this codebase|the app)\s+([^.]+)/gi,
        /(?:note that|remember that|important:)\s+([^.]+)/gi,
      ];

      for (const pattern of factPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const captured = match[1];
          if (captured && captured.length > 10 && captured.length < 200) {
            facts.push({
              id: crypto.randomUUID(),
              type: "fact",
              content: captured.trim(),
              timestamp: Date.now(),
              sessionId: this.sessionId,
              confidence: 0.6,
            });
          }
        }
      }
    }

    return facts;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async reset(): Promise<void> {
    await this.init();

    // Clear Graph DB
    if (this.conn) {
      try {
        // Drop tables if they exist
        await this.conn.query("DROP TABLE RELATED_TO");
      } catch (e) {}

      try {
        await this.conn.query("DROP TABLE Fact");
      } catch (e) {}
    }

    // Clear Vector DB
    await this.embeddings.clear();

    // Re-initialize schema
    await this.initSchema();
  }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
    this.initPromise = null;
  }
}

export default AgentCognition;
