import { getLSPClient } from "@/utils/lspClient";
import type { Fact } from "@/utils/agentCognition";
import fs from "fs";
import path from "path";

/**
 * Map LSP symbol kinds to specific graph node types.
 */
function kindToType(kind: string): Fact["type"] {
  const map: Record<string, Fact["type"]> = {
    Function: "function",
    Class: "class",
    Interface: "interface",
    Variable: "variable",
    Method: "function",
    Property: "variable",
    Struct: "class",
    Enum: "class",
    Trait: "interface",
  };
  return map[kind] || "symbol";
}

interface SymbolRelation {
  source: string; // Symbol name
  target: string; // Symbol name
  type: "CALLS" | "DEFINES" | "INHERITS" | "IMPORTS";
  weight: number;
}

export class SymbolExtractor {
  private lsp = getLSPClient();

  /**
   * Resolve an import module to a file path.
   * Handles relative imports and attempts common resolutions.
   */
  private resolveImport(
    fromFile: string,
    module: string,
    isRelative: boolean,
  ): string | null {
    const dir = path.dirname(fromFile);
    const ext = fromFile.split(".").pop() || "";

    if (isRelative) {
      // Relative import - try common extensions
      const extensions =
        ext === "py" ? [".py"] : [".ts", ".tsx", ".js", ".jsx"];
      const basePath = path.resolve(dir, module.replace(/\./g, "/"));

      for (const extTry of extensions) {
        const candidate = basePath + extTry;
        if (fs.existsSync(candidate)) {
          return candidate;
        }
        // Try as directory with index
        const indexCandidate = path.join(basePath, `index${extTry}`);
        if (fs.existsSync(indexCandidate)) {
          return indexCandidate;
        }
      }
    }

    // Return module name for external imports (can be linked later)
    return null;
  }

  async analyze(filePath: string): Promise<{
    facts: Omit<Fact, "id" | "timestamp" | "sessionId">[];
    relations: { sourceIdx: number; targetIdx: number; type: string }[];
  }> {
    if (!fs.existsSync(filePath)) return { facts: [], relations: [] };

    // Standardize on relative paths for the graph
    const relativePath = path.relative(process.cwd(), filePath);
    const content = fs.readFileSync(filePath, "utf-8");

    // Get symbols with detail - this now includes children
    const symbols = await this.lsp.getDocumentSymbolsWithDetails(
      filePath,
      content,
    );

    const facts: Omit<Fact, "id" | "timestamp" | "sessionId">[] = [];
    const relations: { sourceIdx: number; targetIdx: number; type: string }[] =
      [];

    // Track symbol facts to link relations
    const symbolToIdx = new Map<string, number>();
    const filePathToIdx = new Map<string, number>();

    // 1. Create a fact for the file itself using RELATIVE path
    const fileFact: Omit<Fact, "id" | "timestamp" | "sessionId"> = {
      type: "file",
      content: `File: ${relativePath}`,
      data: { file: relativePath },
      confidence: 1.0,
      validated: Date.now(),
    };
    facts.push(fileFact);
    const fileIdx = 0;
    filePathToIdx.set(relativePath, fileIdx);

    // 2. Process imports -> IMPORTS relations
    const imports = await this.lsp.getImports(filePath, content);
    for (const imp of imports) {
      const resolvedAbsPath = this.resolveImport(
        filePath,
        imp.module,
        imp.isRelative,
      );

      const resolvedPath = resolvedAbsPath
        ? path.relative(process.cwd(), resolvedAbsPath)
        : null;

      // Create a fact for the imported module
      const importFact: Omit<Fact, "id" | "timestamp" | "sessionId"> = {
        type: "module",
        content: `Module: ${imp.alias || imp.module}`,
        data: {
          file: resolvedPath || imp.module,
          module: imp.module,
          alias: imp.alias,
          isExternal: !resolvedPath,
        },
        confidence: resolvedPath ? 1.0 : 0.7,
        validated: Date.now(),
      };
      facts.push(importFact);
      const importIdx = facts.length - 1;

      relations.push({
        sourceIdx: fileIdx,
        targetIdx: importIdx,
        type: "IMPORTS",
      });
    }

    // 3. Process symbols recursively
    const processSymbol = (sym: any, parentIdx: number) => {
      // Build rich content string for LLM consumption
      let content = `${sym.kind}: ${sym.name} (${relativePath})`;
      if (sym.signature) {
        content += ` ${sym.signature}`;
      }
      if (sym.docstring) {
        content += ` - ${sym.docstring.slice(0, 150)}`;
      }

      // Create symbol fact with enhanced data
      const fact: Omit<Fact, "id" | "timestamp" | "sessionId"> = {
        type: kindToType(sym.kind),
        content,
        data: {
          file: relativePath,
          symbol: sym.name,
          kind: sym.kind,
          type: kindToType(sym.kind),
          line: sym.line,
          signature: sym.signature,
          docstring: sym.docstring,
          exported: sym.exported,
        },
        confidence: 1.0,
        validated: Date.now(),
      };

      facts.push(fact);
      const symIdx = facts.length - 1;
      symbolToIdx.set(sym.name, symIdx); // Note: Flat map might clash if same name used in nested scopes effectively, but ok for now

      // Link: Parent DEFINES/CONTAINS Symbol
      relations.push({
        sourceIdx: parentIdx,
        targetIdx: symIdx,
        type: parentIdx === fileIdx ? "DEFINES" : "CONTAINS",
      });

      // Inherits relation if applicable (class extension)
      // Note: LSP usually gives inheritance at top level, but if nested classes existed...

      // Recurse for children
      if (sym.children && sym.children.length > 0) {
        for (const child of sym.children) {
          processSymbol(child, symIdx);
        }
      }
    };

    for (const sym of symbols) {
      processSymbol(sym, fileIdx);
    }

    // 4. Extract inheritance -> INHERITS relations
    const inheritance = await this.lsp.getInheritance(filePath, content);
    for (const inh of inheritance) {
      const childIdx = symbolToIdx.get(inh.className);
      let parentIdx = symbolToIdx.get(inh.parentName);

      if (!parentIdx) {
        // Parent is external - create a symbol fact
        const parentFact: Omit<Fact, "id" | "timestamp" | "sessionId"> = {
          type: "class",
          content: `Class: ${inh.parentName}`,
          data: { symbol: inh.parentName, kind: "Class" },
          confidence: 0.8,
          validated: Date.now(),
        };
        facts.push(parentFact);
        parentIdx = facts.length - 1;
        symbolToIdx.set(inh.parentName, parentIdx);
      }

      if (childIdx !== undefined) {
        relations.push({
          sourceIdx: childIdx,
          targetIdx: parentIdx,
          type: "INHERITS",
        });
      }
    }

    // 5. Extract calls with source context -> CALLS relations
    // Get all calls from the file
    const allCalls = await this.lsp.getOutgoingCalls(filePath, content, 1, 1);

    // Group calls by sourceContext and deduplicate
    const processedCalls = new Set<string>();
    for (const call of allCalls) {
      const callKey = `${call.sourceContext || ""}:${call.name}`;
      if (processedCalls.has(callKey)) continue;
      processedCalls.add(callKey);

      // Find or create target fact
      let targetIdx = symbolToIdx.get(call.name);
      if (targetIdx === undefined) {
        // External call - create a weak symbol fact
        const targetFact: Omit<Fact, "id" | "timestamp" | "sessionId"> = {
          type: "symbol",
          content: `Symbol: ${call.name}`,
          data: {
            file: call.file
              ? path.relative(process.cwd(), call.file)
              : undefined,
            symbol: call.name,
          },
          confidence: 0.8,
          validated: Date.now(),
        };
        facts.push(targetFact);
        targetIdx = facts.length - 1;
        symbolToIdx.set(call.name, targetIdx);
      }

      // Find source (calling function)
      let sourceIdx: number | undefined;
      if (call.sourceContext) {
        sourceIdx = symbolToIdx.get(call.sourceContext);
      }
      if (sourceIdx === undefined) {
        sourceIdx = fileIdx; // Top-level call, link from file
      }

      relations.push({
        sourceIdx,
        targetIdx,
        type: "CALLS",
      });
    }

    return { facts, relations };
  }
}

export default SymbolExtractor;
