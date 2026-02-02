import { Database, Statement } from "bun:sqlite";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import log from "@/utils/logger";

// Types
export interface Concept {
  id: string;
  label: string;
  category: string | null;
  language: string;
  complexity: number;
  metadata: Record<string, any> | null;
}

export interface FrontierConcept extends Concept {
  current_score: number;
}

export interface UserMastery {
  user_id: string;
  concept_id: string;
  mastery_score: number;
  last_code?: string | null;
  last_practiced_at: string;
}

export interface SessionLog {
  id?: number;
  user_id: string;
  concept_id: string;
  success: boolean;
  error_code: string | null;
  attempts: number;
  duration_ms?: number;
  timestamp?: string;
}

// Raw JSON node for adding concepts
export interface RawGraphNode {
  id?: string;
  label?: string;
  dependencies?: string[];
  complexity?: number;
  category?: string;
  language?: string;
  project_context?: string;
  comment?: string;
}

export class KnowledgeGraph {
  private db: Database;
  private getFrontierStmt!: Statement;
  private getConceptStmt!: Statement;
  private updateMasteryStmt!: Statement;
  private logSessionStmt!: Statement;
  private getUserMasteryStmt!: Statement;
  private getAllConceptsStmt!: Statement;
  private getAttemptCountStmt!: Statement;
  private getRecentErrorsStmt!: Statement;
  private getTotalDurationStmt!: Statement;
  private getBestPerformanceStmt!: Statement;
  private getMasteredConceptsStmt!: Statement;
  private getTimePerLanguageStmt!: Statement;

  constructor(dbPath: string = "learning.db") {
    // Ensure directory exists
    const dbDir = dirname(dbPath);
    if (dbDir && !existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL;");

    // Initialize schema
    this.initSchema();

    // Migration: Add last_code to user_mastery if it doesn't exist
    try {
      this.db.run("ALTER TABLE user_mastery ADD COLUMN last_code TEXT;");
    } catch (e) {
      // Column already exists or table doesn't exist yet
    }

    // Prepare statements
    this.prepareStatements();
  }

  /**
   * Prepare SQL statements for the database
   */
  private prepareStatements(): void {
    // Prepare statements (compile once, run fast)
    this.getFrontierStmt = this.db.prepare(`
      SELECT 
        c.id, 
        c.label, 
        c.category,
        c.language,
        c.complexity,
        c.metadata,
        COALESCE(u.mastery_score, 0.0) as current_score
      FROM concepts c
      LEFT JOIN user_mastery u ON c.id = u.concept_id AND u.user_id = $userId
      WHERE 
        c.language = $language
      AND
        -- Criterion 1: Not yet mastered (Score < 0.8)
        COALESCE(u.mastery_score, 0.0) < 0.8
      AND 
        -- Criterion 2: ALL prerequisites are met
        NOT EXISTS (
          SELECT 1 
          FROM dependencies d 
          JOIN concepts parent ON d.parent_id = parent.id
          LEFT JOIN user_mastery parent_u ON parent.id = parent_u.concept_id AND parent_u.user_id = $userId
          WHERE d.child_id = c.id
          AND COALESCE(parent_u.mastery_score, 0.0) < 0.8 -- Fail if any parent is < 0.8
        )
      ORDER BY c.complexity ASC
    `);

    this.getConceptStmt = this.db.prepare(`
      SELECT id, label, category, language, complexity, metadata
      FROM concepts
      WHERE id = $conceptId
    `);

    this.updateMasteryStmt = this.db.prepare(`
      INSERT INTO user_mastery (user_id, concept_id, mastery_score, last_code, last_practiced_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, concept_id) DO UPDATE SET
        mastery_score = excluded.mastery_score,
        last_code = excluded.last_code,
        last_practiced_at = CURRENT_TIMESTAMP
    `);

    this.logSessionStmt = this.db.prepare(`
      INSERT INTO session_logs (user_id, concept_id, success, error_code, attempts, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.getUserMasteryStmt = this.db.prepare(`
      SELECT user_id, concept_id, mastery_score, last_code, last_practiced_at
      FROM user_mastery
      WHERE user_id = $userId
    `);

    this.getAllConceptsStmt = this.db.prepare(`
      SELECT id, label, category, language, complexity, metadata
      FROM concepts
      ORDER BY complexity ASC
    `);

    this.getAttemptCountStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM session_logs
      WHERE user_id = $userId AND concept_id = $conceptId
    `);

    this.getRecentErrorsStmt = this.db.prepare(`
      SELECT DISTINCT error_code
      FROM session_logs
      WHERE user_id = $userId 
      AND error_code IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 5
    `);

    this.getTotalDurationStmt = this.db.prepare(`
      SELECT SUM(COALESCE(duration_ms, 0)) as total_duration
      FROM session_logs
      WHERE user_id = $userId
    `);

    this.getBestPerformanceStmt = this.db.prepare(`
      SELECT concept_id, MIN(attempts) as best_attempts, MIN(duration_ms) as best_duration
      FROM session_logs 
      WHERE user_id = $userId AND success = 1
      GROUP BY concept_id
    `);

    this.getMasteredConceptsStmt = this.db.prepare(`
      SELECT c.id, c.label, c.category, c.language, c.complexity, c.metadata
      FROM concepts c
      JOIN user_mastery u ON c.id = u.concept_id
      WHERE u.user_id = $userId AND u.mastery_score >= 0.8
      ORDER BY c.complexity DESC
    `);

    this.getTimePerLanguageStmt = this.db.prepare(`
      SELECT c.language, SUM(COALESCE(s.duration_ms, 0)) as total_duration
      FROM session_logs s
      JOIN concepts c ON s.concept_id = c.id
      WHERE s.user_id = $userId
      GROUP BY c.language
    `);
  }

  /**
   * Initialize the database schema and seed if empty
   */
  private initSchema(): void {
    const schemaPath = join(dirname(import.meta.path), "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");
    this.db.run(schema);

    // Auto-seed if concepts table is empty
    const count = this.db
      .query("SELECT COUNT(*) as count FROM concepts")
      .get() as { count: number };
    if (count.count === 0) {
      const jsonPath = join(
        dirname(import.meta.path),
        "..",
        "..",
        "assets",
        "kg",
        "rust.json",
      );
      this.seedFromJson(jsonPath);
    }
  }

  /**
   * Seed the knowledge graph from a JSON file
   */
  seedFromJson(jsonPath: string): void {
    const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
    const nodes: RawGraphNode[] = data.nodes;

    // Filter out comment-only nodes and ensure valid id/label
    const concepts = nodes.filter(
      (n): n is RawGraphNode & { id: string; label: string } =>
        Boolean(n.id && n.label),
    );

    this.db.transaction(() => {
      // Insert concepts
      const insertConcept = this.db.prepare(`
        INSERT OR REPLACE INTO concepts (id, label, category, language, complexity, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const concept of concepts) {
        insertConcept.run(
          concept.id,
          concept.label,
          concept.category || null,
          (concept.language || "rust").toLowerCase(),
          concept.complexity || 0.5,
          JSON.stringify({
            project_context: concept.project_context || null,
          }),
        );
      }

      // Insert dependencies
      const insertDep = this.db.prepare(`
        INSERT OR IGNORE INTO dependencies (child_id, parent_id)
        VALUES (?, ?)
      `);

      for (const concept of concepts) {
        if (concept.dependencies) {
          for (const parentId of concept.dependencies) {
            insertDep.run(concept.id, parentId);
          }
        }
      }
    })();

    log(`✅ Seeded ${concepts.length} concepts from ${jsonPath}`);
  }

  /**
   * Add a new concept to the graph
   */
  addConcept(concept: RawGraphNode): void {
    if (!concept.id || !concept.label) {
      throw new Error("Concept ID and label are required");
    }

    const id = concept.id;
    const label = concept.label;
    const category = concept.category || null;
    const language = (concept.language || "rust").toLowerCase();
    const complexity = concept.complexity || 0.5;
    const projectContext = concept.project_context || null;
    const dependencies = concept.dependencies || [];

    log(
      `Graph: Adding concept ${id} (${label}) for lang=${language} with deps=[${dependencies.join(", ")}]`,
    );

    this.db.transaction(() => {
      // Insert concept
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO concepts (id, label, category, language, complexity, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          id,
          label,
          category,
          language,
          complexity,
          JSON.stringify({
            project_context: projectContext,
          }),
        );

      // Insert dependencies
      if (dependencies.length > 0) {
        const insertDep = this.db.prepare(`
          INSERT OR IGNORE INTO dependencies (child_id, parent_id)
          VALUES (?, ?)
        `);

        for (const parentId of dependencies) {
          insertDep.run(id, parentId);
        }
      }
    })();
  }

  /**
   * Get all concepts that are mastered by the user
   */
  getMasteredConcepts(userId: string): Concept[] {
    const rows = this.getMasteredConceptsStmt.all({ $userId: userId }) as any[];
    return rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  /**
   * Get the learning frontier - available lessons for a user
   * Returns concepts that:
   * 1. Are not yet mastered (score < 0.8)
   * 2. Have all prerequisites mastered
   */
  getFrontier(userId: string, language: string = "rust"): FrontierConcept[] {
    const rows = this.getFrontierStmt.all({
      $userId: userId,
      $language: language,
    }) as any[];
    return rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  /**
   * Get the next recommended lesson for a user
   * Optionally prioritize by category (e.g., 'cli')
   */
  getNextLesson(
    userId: string,
    language: string,
    priorityCategory?: string,
  ): FrontierConcept | null {
    const frontier = this.getFrontier(userId, language);

    if (frontier.length === 0) {
      return null;
    }

    // Prioritize by category if specified
    if (priorityCategory) {
      const priorityLesson = frontier.find(
        (l) => l.category === priorityCategory,
      );
      if (priorityLesson !== undefined) return priorityLesson;
    }

    // Otherwise return the easiest available concept
    return frontier[0] ?? null;
  }

  /**
   * Get a specific concept by ID
   */
  getConcept(conceptId: string): Concept | null {
    const row = this.getConceptStmt.get({ $conceptId: conceptId }) as any;
    if (!row) return null;
    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }

  /**
   * Get all concepts
   */
  getAllConcepts(language?: string): Concept[] {
    let rows = this.getAllConceptsStmt.all() as any[];
    if (language) {
      rows = rows.filter((r) => r.language === language);
    }
    return rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  /**
   * Update user mastery score for a concept
   */
  updateMastery(userId: string, conceptId: string, score: number): void {
    const clampedScore = Math.max(0, Math.min(1, score));
    this.updateMasteryStmt.run({
      $userId: userId,
      $conceptId: conceptId,
      $score: clampedScore,
    });
  }

  /**
   * Log a practice session
   */
  logSession(session: SessionLog): void {
    this.logSessionStmt.run(
      session.user_id,
      session.concept_id,
      session.success ? 1 : 0,
      session.error_code,
      session.attempts,
      session.duration_ms ?? 0,
    );
  }

  /**
   * Export graph to Mermaid syntax for visualization
   * Optionally includes user mastery coloring
   */
  getMermaidGraph(userId?: string, language?: string): string {
    const concepts = this.getAllConcepts(language);
    const conceptIds = new Set(concepts.map((c) => c.id));

    // Get all edges and filter by the concepts we have
    const allEdges = this.db
      .query("SELECT parent_id, child_id FROM dependencies")
      .all() as { parent_id: string; child_id: string }[];

    const edges = allEdges.filter(
      (e) => conceptIds.has(e.parent_id) && conceptIds.has(e.child_id),
    );

    const masteryMap = userId
      ? new Map(
          this.getUserMastery(userId).map((m) => [
            m.concept_id,
            m.mastery_score,
          ]),
        )
      : null;

    // Identify the "next" concept to show as in progress if nothing has been started
    const nextConcept =
      userId && language ? this.getNextLesson(userId, language) : null;

    let mermaid = "graph TD;\n";

    // Add node definitions with labels
    for (const concept of concepts) {
      const shortId = concept.id.replace(/\./g, "_");
      const score = masteryMap?.get(concept.id) ?? 0;

      // Color based on mastery: green (≥0.8), yellow (>0 or is next), gray (0)
      let style = "";
      if (masteryMap) {
        if (score >= 0.8) {
          style = `:::mastered`;
        } else if (
          score > 0 ||
          (nextConcept && nextConcept.id === concept.id)
        ) {
          style = `:::inProgress`;
        }
      }

      mermaid += `    ${shortId}["${concept.label}"]${style};\n`;
    }

    mermaid += "\n";

    // Add edges
    for (const edge of edges) {
      const parentId = edge.parent_id.replace(/\./g, "_");
      const childId = edge.child_id.replace(/\./g, "_");
      mermaid += `    ${parentId} --> ${childId};\n`;
    }

    // Add style classes
    if (masteryMap) {
      mermaid += "\n";
      mermaid +=
        "    classDef mastered fill:#22c55e,stroke:#16a34a,color:#fff;\n";
      mermaid +=
        "    classDef inProgress fill:#eab308,stroke:#ca8a04,color:#000;\n";
    }

    return mermaid;
  }

  /**
   * Get all mastery records for a user
   */
  getUserMastery(userId: string): UserMastery[] {
    return this.getUserMasteryStmt.all({ $userId: userId }) as UserMastery[];
  }

  /**
   * Get the number of attempts a user has made for a specific concept
   */
  getAttemptCount(userId: string, conceptId: string): number {
    const result = this.getAttemptCountStmt.get({
      $userId: userId,
      $conceptId: conceptId,
    }) as { count: number } | null;
    return result?.count ?? 0;
  }

  /**
   * Get recent error codes encountered by the user
   * Used to customize future lessons
   */
  getRecentErrors(userId: string): string[] {
    const rows = this.getRecentErrorsStmt.all({ $userId: userId }) as {
      error_code: string;
    }[];
    return rows.map((r) => r.error_code);
  }

  /**
   * Get all prerequisite concepts for a given concept
   * Recursively retrieves the full dependency tree
   */
  getConceptPrerequisites(conceptId: string): Concept[] {
    // Recursive CTE to get all ancestors (prerequisites) of a concept
    const rows = this.db
      .query(
        `
        WITH RECURSIVE prereqs AS (
          -- Base case: direct parents
          SELECT parent_id as id
          FROM dependencies
          WHERE child_id = $conceptId
          
          UNION
          
          -- Recursive case: parents of parents
          SELECT d.parent_id as id
          FROM dependencies d
          JOIN prereqs p ON d.child_id = p.id
        )
        SELECT c.id, c.label, c.category, c.language, c.complexity, c.metadata
        FROM concepts c
        JOIN prereqs p ON c.id = p.id
        ORDER BY c.complexity ASC
      `,
      )
      .all({ $conceptId: conceptId }) as any[];

    return rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  /**
   * Rust error code penalties - specific compiler errors that indicate
   * fundamental misunderstanding of key concepts
   */
  private static readonly ERROR_PENALTIES: Record<string, number> = {
    E0382: 0.15, // Use of moved value (Ownership)
    E0502: 0.12, // Cannot borrow as mutable (Borrowing)
    E0499: 0.12, // Cannot borrow as mutable more than once
    E0597: 0.1, // Borrowed value does not live long enough (Lifetimes)
    E0308: 0.05, // Mismatched types
    E0425: 0.03, // Cannot find value (typos, scope issues)
  };

  /**
   * Map complexity to level 1-4
   */
  private complexityToLevel(comp: number): number {
    if (comp >= 0.75) return 4;
    if (comp >= 0.5) return 3;
    if (comp >= 0.25) return 2;
    return 1;
  }

  /**
   * Process a lesson result and update mastery score
   * Uses transactional updates for consistency
   */
  processLessonResult(
    userId: string,
    conceptId: string,
    result: {
      success: boolean;
      errorCode?: string | null;
      attempts: number;
      duration?: number;
      code?: string;
    },
  ): {
    previousScore: number;
    newScore: number;
    mastered: boolean;
    previousLevel: number;
    newLevel: number;
  } {
    // Get concept complexity to factor into mastery calculation
    const concept = this.getConcept(conceptId);
    if (!concept) {
      throw new Error(`Concept not found: ${conceptId}`);
    }
    const complexity = concept.complexity || 0.5;
    const category = concept.category || "general";

    // Get current progress to find previous level
    const progress = this.getUserProgress(userId);
    const previousLevel = progress.topicLevels[category] || 1;

    // Base score change
    // Formula: Scale gain based on complexity and performance
    let scoreChange = 0;

    if (result.success) {
      // Base gain: 0.25 to 0.6 depending on complexity
      const baseGain = Math.max(0.25, 1.0 - 0.4 * complexity);

      // Attempt Factor: 1.0 for 1st, 0.9 for 2nd, 0.8 for 3rd, floor at 0.6
      const attemptFactor = Math.max(0.6, 1.1 - 0.1 * result.attempts);

      // Duration factor: "not too harsh"
      // Benchmark: 1 min to 5 mins depending on complexity
      const benchmarkMs = 60000 + complexity * 240000;
      let durationFactor = 1.0;

      if (result.duration && result.duration > benchmarkMs * 2) {
        // Only start penalizing after 2x the benchmark
        // Small penalty: 0.05 for every extra multiple of benchmark, floor at 0.85
        const extraMultiples =
          (result.duration - benchmarkMs * 2) / benchmarkMs;
        durationFactor = Math.max(0.85, 1.0 - extraMultiples * 0.05);
      }

      scoreChange = baseGain * attemptFactor * durationFactor;
    } else {
      scoreChange = -0.1;
    }

    // Penalize specific Rust errors more heavily
    if (result.errorCode) {
      const penalty = KnowledgeGraph.ERROR_PENALTIES[result.errorCode];
      if (penalty !== undefined) {
        scoreChange -= penalty;
      }
    }

    // Fetch current score
    const currentEntry = this.db
      .query(
        "SELECT mastery_score FROM user_mastery WHERE user_id = ? AND concept_id = ?",
      )
      .get(userId, conceptId) as { mastery_score: number } | null;

    const currentScore = currentEntry?.mastery_score ?? 0.0;

    // Clamp between 0.0 and 1.0
    const newScore = Math.min(Math.max(currentScore + scoreChange, 0.0), 1.0);

    // Run updates transactionally
    this.db.transaction(() => {
      this.updateMasteryStmt.run(
        userId,
        conceptId,
        newScore,
        result.code || null,
      );
      this.logSessionStmt.run(
        userId,
        conceptId,
        result.success ? 1 : 0,
        result.errorCode || null,
        result.attempts,
        result.duration ?? 0,
      );
    })();

    // Get new progress to find new level
    const newProgress = this.getUserProgress(userId);
    const newLevel = newProgress.topicLevels[category] || 1;

    return {
      previousScore: currentScore,
      newScore,
      mastered: newScore >= 0.8,
      previousLevel,
      newLevel,
    };
  }

  /**
   * Calculate mastery update (legacy method for compatibility)
   * @deprecated Use processLessonResult instead
   */
  calculateMasteryUpdate(
    currentScore: number,
    success: boolean,
    attempts: number,
  ): number {
    const scoreChange = success ? 0.3 : -0.1;
    const newScore = currentScore + scoreChange;
    return Math.max(0, Math.min(1, newScore));
  }

  /**
   * Get user progress statistics
   */
  getUserProgress(userId: string): {
    total: number;
    mastered: number;
    inProgress: number;
    notStarted: number;
    averageMastery: number;
    totalTime: number;
    topicLevels: Record<string, number>;
    overallLevel: number;
    languages: Record<
      string,
      {
        total: number;
        mastered: number;
        inProgress: number;
        notStarted: number;
        averageMastery: number;
        overallLevel: number;
        totalTime: number;
      }
    >;
  } {
    const allConcepts = this.getAllConcepts();
    const userMastery = this.getUserMastery(userId);
    const masteryMap = new Map(
      userMastery.map((m) => [m.concept_id, m.mastery_score]),
    );

    let mastered = 0;
    let inProgress = 0;
    let notStarted = 0;
    let totalMastery = 0;

    // Get performance stats from logs to adjust effective complexity for level calc
    const performanceRows = this.getBestPerformanceStmt.all({
      $userId: userId,
    }) as {
      concept_id: string;
      best_attempts: number;
      best_duration: number;
    }[];

    const performanceMap = new Map(
      performanceRows.map((r) => [r.concept_id, r]),
    );

    // Track max complexity mastered per category
    const maxComplexityPerCategory: Record<string, number> = {};
    let overallMaxComplexityMastered = 0;

    for (const concept of allConcepts) {
      const score = masteryMap.get(concept.id) || 0;
      const isMastered = score >= 0.8;
      totalMastery += score;

      if (isMastered) {
        mastered++;
        const cat = concept.category || "general";

        // Performance adjustment for level calculation
        const perf = performanceMap.get(concept.id);
        let performanceMultiplier = 1.0;

        if (perf) {
          // Attempt penalty: 1-2 attempts is perfect (1.0).
          // 3: 0.95, 4: 0.9, 5: 0.85, ..., 10+: 0.5
          const aMult = Math.max(0.5, 1.05 - 0.05 * perf.best_attempts);

          // Duration penalty
          const benchmark = 60000 + concept.complexity * 240000;
          let dMult = 1.0;
          if (perf.best_duration > benchmark * 3) {
            // Only penalize if >3x benchmark
            dMult = Math.max(0.9, 1.0 - perf.best_duration / (benchmark * 50));
          }
          performanceMultiplier = aMult * dMult;
        }

        const effectiveComplexity = concept.complexity * performanceMultiplier;

        maxComplexityPerCategory[cat] = Math.max(
          maxComplexityPerCategory[cat] || 0,
          effectiveComplexity,
        );
        overallMaxComplexityMastered = Math.max(
          overallMaxComplexityMastered,
          effectiveComplexity,
        );
      } else if (score > 0) {
        inProgress++;
      } else {
        notStarted++;
      }
    }

    const totalDurationResult = this.getTotalDurationStmt.get({
      $userId: userId,
    }) as { total_duration: number } | null;

    const totalTime = totalDurationResult?.total_duration ?? 0;

    // Get time per language
    const timePerLangRows = this.getTimePerLanguageStmt.all({
      $userId: userId,
    }) as { language: string; total_duration: number }[];
    const timePerLangMap = new Map(
      timePerLangRows.map((r) => [r.language, r.total_duration]),
    );

    const languages: Record<
      string,
      {
        total: number;
        mastered: number;
        inProgress: number;
        notStarted: number;
        totalMastery: number;
        maxComplexityMastered: number;
      }
    > = {};

    for (const concept of allConcepts) {
      const score = masteryMap.get(concept.id) || 0;
      const isMastered = score >= 0.8;
      totalMastery += score;

      const lang = concept.language || "rust";
      if (!languages[lang]) {
        languages[lang] = {
          total: 0,
          mastered: 0,
          inProgress: 0,
          notStarted: 0,
          totalMastery: 0,
          maxComplexityMastered: 0,
        };
      }

      languages[lang].total++;
      languages[lang].totalMastery += score;

      if (isMastered) {
        mastered++;
        languages[lang].mastered++;
        const cat = concept.category || "general";

        // Performance adjustment for level calculation
        const perf = performanceMap.get(concept.id);
        let performanceMultiplier = 1.0;

        if (perf) {
          // Attempt penalty: 1-2 attempts is perfect (1.0).
          // 3: 0.95, 4: 0.9, 5: 0.85, ..., 10+: 0.5
          const aMult = Math.max(0.5, 1.05 - 0.05 * perf.best_attempts);

          // Duration penalty
          const benchmark = 60000 + concept.complexity * 240000;
          let dMult = 1.0;
          if (perf.best_duration > benchmark * 3) {
            // Only penalize if >3x benchmark
            dMult = Math.max(0.9, 1.0 - perf.best_duration / (benchmark * 50));
          }
          performanceMultiplier = aMult * dMult;
        }

        const effectiveComplexity = concept.complexity * performanceMultiplier;

        maxComplexityPerCategory[cat] = Math.max(
          maxComplexityPerCategory[cat] || 0,
          effectiveComplexity,
        );
        overallMaxComplexityMastered = Math.max(
          overallMaxComplexityMastered,
          effectiveComplexity,
        );

        languages[lang].maxComplexityMastered = Math.max(
          languages[lang].maxComplexityMastered,
          effectiveComplexity,
        );
      } else if (score > 0) {
        inProgress++;
        languages[lang].inProgress++;
      } else {
        notStarted++;
        languages[lang].notStarted++;
      }
    }

    const topicLevels: Record<string, number> = {};
    // Ensure all categories present in the graph are represented
    const categories = new Set(allConcepts.map((c) => c.category || "general"));
    for (const cat of categories) {
      topicLevels[cat] = this.complexityToLevel(
        maxComplexityPerCategory[cat] || 0,
      );
    }

    // Format language breakdown
    const languageBreakdown: Record<string, any> = {};
    for (const [lang, stats] of Object.entries(languages)) {
      languageBreakdown[lang] = {
        total: stats.total,
        mastered: stats.mastered,
        inProgress: stats.inProgress,
        notStarted: stats.notStarted,
        averageMastery: stats.total > 0 ? stats.totalMastery / stats.total : 0,
        overallLevel: this.complexityToLevel(stats.maxComplexityMastered),
        totalTime: timePerLangMap.get(lang) || 0,
      };
    }

    return {
      total: allConcepts.length,
      mastered,
      inProgress,
      notStarted,
      averageMastery:
        allConcepts.length > 0 ? totalMastery / allConcepts.length : 0,
      totalTime,
      topicLevels,
      overallLevel: this.complexityToLevel(overallMaxComplexityMastered),
      languages: languageBreakdown,
    };
  }

  /**
   * Reset user progress (mastery and logs) without deleting concepts or lessons
   */
  resetUserProgress(userId?: string): void {
    log(
      `⚠️ Resetting progress for ${userId ? "user " + userId : "ALL users"}...`,
    );
    this.db.transaction(() => {
      if (userId) {
        this.db.run("DELETE FROM session_logs WHERE user_id = ?", [userId]);
        this.db.run("DELETE FROM user_mastery WHERE user_id = ?", [userId]);
      } else {
        this.db.run("DELETE FROM session_logs");
        this.db.run("DELETE FROM user_mastery");
      }
    })();
  }

  /**
   * Reset the entire database (Drop tables and re-initialize)
   */
  resetDatabase(): void {
    log("⚠️ Resetting database...");
    this.db.transaction(() => {
      this.db.run("DROP TABLE IF EXISTS session_logs");
      this.db.run("DROP TABLE IF EXISTS user_mastery");
      this.db.run("DROP TABLE IF EXISTS dependencies");
      this.db.run("DROP TABLE IF EXISTS concepts");
    })();

    // Re-initialize schema and seed
    this.initSchema();
    this.prepareStatements();
    log("✅ Database reset complete.");
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// Export singleton factory
let instance: KnowledgeGraph | null = null;

export function getKnowledgeGraph(dbPath?: string): KnowledgeGraph {
  if (!instance) {
    instance = new KnowledgeGraph(dbPath);
  }
  return instance;
}
