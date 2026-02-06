/**
 * GraphSerializer - Optimized serialization of knowledge graph subsets for LLM context.
 *
 * Converts graph data into concise, LLM-friendly markdown format that maximizes
 * information density while staying within context window limits.
 */

import type { Fact } from "@/utils/agentCognition";
import path from "path";

export interface SerializationOptions {
  maxSymbols?: number;
  maxDecisions?: number;
  maxFacts?: number;
  includeRelations?: boolean;
  format?: "markdown" | "compact";
}

const DEFAULT_OPTIONS: SerializationOptions = {
  maxSymbols: 10,
  maxDecisions: 5,
  maxFacts: 5,
  includeRelations: true,
  format: "markdown",
};

export class GraphSerializer {
  /**
   * Serialize a collection of facts into LLM-friendly context.
   */
  static serialize(
    facts: Fact[],
    relations?: Array<{ source: string; target: string; type: string }>,
    options: SerializationOptions = {},
  ): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (opts.format === "compact") {
      return GraphSerializer.serializeCompact(facts, relations, opts);
    }

    return GraphSerializer.serializeMarkdown(facts, relations, opts);
  }

  /**
   * Markdown format - human-readable, good for general context.
   */
  private static serializeMarkdown(
    facts: Fact[],
    relations?: Array<{ source: string; target: string; type: string }>,
    opts: SerializationOptions = DEFAULT_OPTIONS,
  ): string {
    if (facts.length === 0) return "";

    const parts: string[] = [];

    // Group facts by type
    const byType = GraphSerializer.groupByType(facts);

    // Code entities (new types: file, module, function, class, interface, variable, symbol)
    const codeTypes = [
      "file",
      "module",
      "function",
      "class",
      "interface",
      "variable",
      "symbol",
      "concept",
    ];
    const codeEntities = facts.filter((f) => codeTypes.includes(f.type));
    if (codeEntities.length > 0) {
      parts.push("## Code Context\n");

      // Group by file
      const byFile = new Map<string, Fact[]>();
      for (const c of codeEntities.slice(0, opts.maxSymbols!)) {
        const file = (c.data?.file as string) || "unknown";
        const list = byFile.get(file) || [];
        list.push(c);
        byFile.set(file, list);
      }

      for (const [file, symbols] of byFile) {
        const fileName = path.basename(file);
        parts.push(`### ${fileName}\n`);
        for (const sym of symbols) {
          const sig = sym.data?.signature ? ` ${sym.data.signature}` : "";
          const exp = sym.data?.exported ? "export " : "";
          parts.push(
            `- \`${exp}${sym.data?.kind || "Symbol"}: ${sym.data?.symbol}${sig}\``,
          );
          if (sym.data?.docstring) {
            const doc = (sym.data.docstring as string).slice(0, 80);
            parts.push(`  - ${doc}${doc.length >= 80 ? "..." : ""}`);
          }
        }
        parts.push("");
      }
    }

    // Decisions
    const decisions = byType.get("decision") || [];
    if (decisions.length > 0) {
      parts.push("## Project Decisions\n");
      for (const d of decisions.slice(0, opts.maxDecisions!)) {
        parts.push(`- ${d.content}`);
      }
      parts.push("");
    }

    // Facts
    const factItems = byType.get("fact") || [];
    if (factItems.length > 0) {
      parts.push("## Known Facts\n");
      for (const f of factItems.slice(0, opts.maxFacts!)) {
        parts.push(`- ${f.content}`);
      }
      parts.push("");
    }

    // Relations (optional)
    if (opts.includeRelations && relations && relations.length > 0) {
      parts.push("## Relationships\n");
      const relationsByType = new Map<string, number>();
      for (const r of relations) {
        relationsByType.set(r.type, (relationsByType.get(r.type) || 0) + 1);
      }
      for (const [type, count] of relationsByType) {
        parts.push(`- ${type}: ${count} connections`);
      }
      parts.push("");
    }

    return parts.join("\n").trim();
  }

  /**
   * Compact format - minimal tokens, maximum information density.
   */
  private static serializeCompact(
    facts: Fact[],
    relations?: Array<{ source: string; target: string; type: string }>,
    opts: SerializationOptions = DEFAULT_OPTIONS,
  ): string {
    if (facts.length === 0) return "";

    const lines: string[] = [];
    const byType = GraphSerializer.groupByType(facts);

    // Code entities
    const codeTypes = [
      "file",
      "module",
      "function",
      "class",
      "interface",
      "variable",
      "symbol",
      "concept",
    ];
    const codeEntities = facts.filter((f) => codeTypes.includes(f.type));
    if (codeEntities.length > 0) {
      lines.push("[code]");
      for (const c of codeEntities.slice(0, opts.maxSymbols!)) {
        const kind =
          (c.data?.kind as string)?.charAt(0) || c.type.charAt(0).toUpperCase();
        const name = c.data?.symbol || "?";
        const sig = c.data?.signature || "";
        const file = c.data?.file
          ? `@${path.basename(c.data.file as string)}`
          : "";
        lines.push(`${kind}:${name}${sig}${file}`);
      }
    }

    // Decisions: brief
    const decisions = byType.get("decision") || [];
    if (decisions.length > 0) {
      lines.push("[dec]");
      for (const d of decisions.slice(0, opts.maxDecisions!)) {
        lines.push(d.content.slice(0, 100));
      }
    }

    return lines.join("\n");
  }

  /**
   * Create a focused context for a specific file.
   */
  static serializeFileContext(
    filePath: string,
    symbols: Fact[],
    relatedFacts: Fact[],
  ): string {
    const parts: string[] = [
      `## File: ${path.basename(filePath)}\n`,
      `Path: \`${filePath}\`\n`,
    ];

    if (symbols.length > 0) {
      parts.push("### Symbols\n");
      for (const sym of symbols) {
        const sig = sym.data?.signature ? `: ${sym.data.signature}` : "";
        parts.push(`- **${sym.data?.kind}** \`${sym.data?.symbol}\`${sig}`);
      }
      parts.push("");
    }

    if (relatedFacts.length > 0) {
      parts.push("### Related Knowledge\n");
      for (const f of relatedFacts.slice(0, 5)) {
        parts.push(`- [${f.type}] ${f.content}`);
      }
    }

    return parts.join("\n").trim();
  }

  /**
   * Create summary statistics for a graph subset.
   */
  static summarize(
    facts: Fact[],
    relations?: Array<{ source: string; target: string; type: string }>,
  ): string {
    const byType = GraphSerializer.groupByType(facts);
    const counts = Array.from(byType.entries())
      .map(([type, list]) => `${type}:${list.length}`)
      .join(" ");

    const relCount = relations?.length || 0;
    return `[${facts.length} facts (${counts}), ${relCount} relations]`;
  }

  private static groupByType(facts: Fact[]): Map<string, Fact[]> {
    const byType = new Map<string, Fact[]>();
    for (const fact of facts) {
      const list = byType.get(fact.type) || [];
      list.push(fact);
      byType.set(fact.type, list);
    }
    return byType;
  }
}

export default GraphSerializer;
