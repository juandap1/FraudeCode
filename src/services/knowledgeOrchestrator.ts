/**
 * KnowledgeOrchestrator - Centralized coordination of knowledge graph operations.
 *
 * Responsibilities:
 * 1. Coordinate SymbolExtractor and AgentCognition for file indexing
 * 2. Handle file change events (debounced)
 * 3. Provide unified getContextForQuery() API for LLM context injection
 */

import AgentCognition from "@/utils/agentCognition";
import { SymbolExtractor } from "@/services/symbolExtractor";
import { GraphSerializer } from "@/services/graphSerializer";
import fs from "fs";
import path from "path";
import ignore from "ignore";
import log from "@/utils/logger";

// Debounce time for file change events (ms)
const DEBOUNCE_MS = 500;

// File extensions to index
const INDEXABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py"];

export class KnowledgeOrchestrator {
  private static instance: KnowledgeOrchestrator;
  private cognition: AgentCognition;
  private extractor: SymbolExtractor;
  private pendingChanges: Map<string, NodeJS.Timeout> = new Map();
  private watchedDirs: Set<string> = new Set();
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private ig = ignore();

  private constructor() {
    this.cognition = AgentCognition.getInstance();
    this.extractor = new SymbolExtractor();
  }

  static getInstance(): KnowledgeOrchestrator {
    if (!KnowledgeOrchestrator.instance) {
      KnowledgeOrchestrator.instance = new KnowledgeOrchestrator();
    }
    return KnowledgeOrchestrator.instance;
  }

  /**
   * Initialize the orchestrator with a project root.
   * Loads .gitignore patterns and sets up file watching.
   */
  async init(rootPath: string): Promise<void> {
    // Load .gitignore patterns
    const gitignorePath = path.join(rootPath, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      this.ig.add(gitignoreContent);
    }
    // Always ignore these
    this.ig.add([".fraude", "node_modules", "dist", "build", ".git"]);

    // Initialize cognition
    await this.cognition.init();

    log(`[KnowledgeOrchestrator] Initialized for ${rootPath}`);
  }

  /**
   * Start watching a directory for file changes.
   * Changes are debounced to avoid excessive re-indexing.
   */
  watchDirectory(dirPath: string): void {
    if (this.watchedDirs.has(dirPath)) return;

    try {
      const watcher = fs.watch(
        dirPath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(dirPath, filename);
          const ext = path.extname(filename);

          // Only process indexable files
          if (!INDEXABLE_EXTENSIONS.includes(ext)) return;

          // Check gitignore
          const relativePath = path.relative(dirPath, fullPath);
          if (this.ig.ignores(relativePath)) return;

          // Debounce the change
          this.debouncedReindex(fullPath);
        },
      );

      this.watchers.set(dirPath, watcher);
      this.watchedDirs.add(dirPath);
      log(`[KnowledgeOrchestrator] Watching directory: ${dirPath}`);
    } catch (e) {
      log(`[KnowledgeOrchestrator] Failed to watch ${dirPath}: ${e}`);
    }
  }

  /**
   * Stop watching a directory.
   */
  unwatchDirectory(dirPath: string): void {
    const watcher = this.watchers.get(dirPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(dirPath);
      this.watchedDirs.delete(dirPath);
    }
  }

  /**
   * Debounced file reindexing.
   * Prevents rapid re-indexing when files are being actively edited.
   */
  private debouncedReindex(filePath: string): void {
    // Cancel any pending reindex for this file
    const existing = this.pendingChanges.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule new reindex
    const timeout = setTimeout(async () => {
      this.pendingChanges.delete(filePath);
      await this.indexFile(filePath);
    }, DEBOUNCE_MS);

    this.pendingChanges.set(filePath, timeout);
  }

  /**
   * Index a single file, updating the knowledge graph.
   * Clears old symbols for the file before indexing.
   */
  async indexFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      log(`[KnowledgeOrchestrator] File not found, skipping: ${filePath}`);
      return;
    }

    try {
      await this.cognition.indexFile(filePath);
      log(`[KnowledgeOrchestrator] Indexed: ${filePath}`);
    } catch (e) {
      log(`[KnowledgeOrchestrator] Failed to index ${filePath}: ${e}`);
    }
  }

  /**
   * Index an entire project directory.
   * Respects .gitignore patterns and runs in background.
   */
  async indexProject(rootPath: string): Promise<void> {
    await this.init(rootPath);
    await this.cognition.indexDirectory(rootPath, INDEXABLE_EXTENSIONS);
    this.watchDirectory(rootPath);
  }

  /**
   * Handle a file modification event from external tools.
   * Called by file-modifying tools to trigger re-indexing.
   */
  onFileModified(filePath: string): void {
    const ext = path.extname(filePath);
    if (!INDEXABLE_EXTENSIONS.includes(ext)) return;

    this.debouncedReindex(filePath);
  }

  /**
   * Get optimized context for a query.
   * Combines relevant facts from the knowledge graph into LLM-friendly format.
   */
  async getContextForQuery(
    query: string,
    options?: { format?: "markdown" | "compact" },
  ): Promise<string> {
    const facts = await this.cognition.retrieveRelevant(query, 10);

    if (facts.length === 0) {
      return "";
    }

    // Use GraphSerializer for consistent formatting
    const context = GraphSerializer.serialize(facts, undefined, {
      format: options?.format || "markdown",
      maxSymbols: 8,
      maxDecisions: 4,
      maxFacts: 4,
      includeRelations: false,
    });

    return context
      ? `<knowledge_context>\n${context}\n</knowledge_context>`
      : "";
  }

  /**
   * Get broad project context for session priming.
   * Returns high-confidence facts without query-specific filtering.
   */
  // async getPrimingContext(): Promise<string> {
  //   await this.cognition.init();
  //   return this.cognition.getPrimingContext();
  // }

  /**
   * Get a graph subset for serialization.
   * Returns facts and their relationships within a specified depth.
   */
  async getGraphSubset(
    nodeIds: string[],
    depth: number = 1,
  ): Promise<{
    facts: Awaited<ReturnType<AgentCognition["findByType"]>>;
    related: Map<string, Awaited<ReturnType<AgentCognition["findRelated"]>>>;
  }> {
    const related = new Map<
      string,
      Awaited<ReturnType<AgentCognition["findRelated"]>>
    >();

    // Collect starting facts
    const allFacts = await this.cognition.query(
      `MATCH (f:Fact) WHERE f.id IN $ids RETURN f`,
      { ids: nodeIds },
    );

    // Get related facts for each starting node
    for (const id of nodeIds) {
      const relatedFacts = await this.cognition.findRelated(id, depth);
      related.set(id, relatedFacts);
    }

    return { facts: allFacts as any, related };
  }

  /**
   * Get all symbols defined in a specific file.
   */
  async getSymbolsForFile(
    filePath: string,
  ): Promise<Awaited<ReturnType<AgentCognition["findByType"]>>> {
    const results = await this.cognition.query(
      `
      MATCH (f:Fact)
      WHERE f.type = 'concept' AND f.data CONTAINS $file
      RETURN f
    `,
      { file: `"${filePath}"` },
    );

    return results.map((row: any) => ({
      id: row.f.id,
      type: row.f.type,
      content: row.f.content,
      data: row.f.data ? JSON.parse(row.f.data) : undefined,
      timestamp: row.f.timestamp,
      sessionId: row.f.sessionId,
      confidence: row.f.confidence,
      validated: row.f.validated,
    }));
  }

  /**
   * Shutdown the orchestrator, closing all watchers.
   */
  shutdown(): void {
    for (const [dir, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
    this.watchedDirs.clear();
    this.pendingChanges.clear();
    log("[KnowledgeOrchestrator] Shutdown complete");
  }
}

export function getKnowledgeOrchestrator(): KnowledgeOrchestrator {
  return KnowledgeOrchestrator.getInstance();
}

export default KnowledgeOrchestrator;
