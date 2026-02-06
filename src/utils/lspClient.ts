import * as ts from "typescript";
import { Parser, Language, Query } from "web-tree-sitter";
import path from "path";
import fs from "fs";
import {
  getQueriesForExtension,
  type LanguageQueries,
} from "./treeSitterQueries";

/**
 * A symbol with extended metadata for knowledge graph enrichment.
 */
export interface DetailedSymbol {
  name: string;
  kind: string;
  line: number;
  signature?: string; // e.g., "foo(x: number, y: string): boolean"
  docstring?: string; // JSDoc or docstring content
  exported?: boolean; // Is this symbol exported?
  children?: DetailedSymbol[];
}

/**
 * Common interface for all language providers
 */
export interface LanguageProvider {
  isSupported(extension: string): boolean;
  getDiagnostics(
    filePath: string,
    content: string,
  ): Promise<{ errors: string[]; warnings: string[] }>;
  findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<{ file: string; line: number; preview?: string } | null>;
  findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ file: string; line: number }>>;
  getDocumentSymbols(
    filePath: string,
    content: string,
  ): Promise<
    Array<{ name: string; kind: string; line: number; children?: any[] }>
  >;

  // Enhanced symbol extraction with signatures and docstrings
  getDocumentSymbolsWithDetails?(
    filePath: string,
    content: string,
  ): Promise<DetailedSymbol[]>;

  // Added missing methods
  getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<string | null>;
  findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ file: string; line: number; preview?: string }>>;

  // Optional advanced features
  prepareCallHierarchy?(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ name: string; kind: string; file: string; line: number }>>;
  getIncomingCalls?(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ name: string; file: string; line: number }>>;
  getOutgoingCalls?(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<
    Array<{ name: string; file: string; line: number; sourceContext?: string }>
  >;
  searchWorkspaceSymbols?(
    query: string,
  ): Promise<Array<{ name: string; kind: string; file: string; line: number }>>;

  // Import extraction for knowledge graph
  getImports?(
    filePath: string,
    content: string,
  ): Promise<Array<{ module: string; alias?: string; isRelative: boolean }>>;

  // Inheritance extraction for knowledge graph
  getInheritance?(
    filePath: string,
    content: string,
  ): Promise<Array<{ className: string; parentName: string; line: number }>>;
}

/**
 * ----------------------------------------------------------------------
 * TIER 1: TypeScript Provider (High Fidelity)
 * Uses the TypeScript Compiler API to provide rich analysis for TS/JS files.
 * ----------------------------------------------------------------------
 */
class TypeScriptProvider implements LanguageProvider {
  private service: ts.LanguageService;
  private files: Map<string, { version: number; content: string }> = new Map();

  constructor(private rootPath: string) {
    const registry = ts.createDocumentRegistry();
    const serviceHost: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(this.files.keys()),
      getScriptVersion: (fileName) =>
        this.files.get(fileName)?.version.toString() || "0",
      getScriptSnapshot: (fileName) => {
        const file = this.files.get(fileName);
        if (file) {
          return ts.ScriptSnapshot.fromString(file.content);
        }
        if (fs.existsSync(fileName)) {
          return ts.ScriptSnapshot.fromString(
            fs.readFileSync(fileName, "utf-8"),
          );
        }
        return undefined;
      },
      getCurrentDirectory: () => this.rootPath,
      getCompilationSettings: () => ({
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
        jsx: ts.JsxEmit.React,
        strict: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
      }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
    };

    this.service = ts.createLanguageService(serviceHost, registry);
  }

  isSupported(ext: string): boolean {
    return ["ts", "tsx", "js", "jsx"].includes(ext);
  }

  private updateFile(filePath: string, content: string) {
    const current = this.files.get(filePath);
    if (!current || current.content !== content) {
      this.files.set(filePath, {
        version: (current?.version || 0) + 1,
        content,
      });
    }
  }

  async getDiagnostics(filePath: string, content: string) {
    this.updateFile(filePath, content);

    const syntactic = this.service.getSyntacticDiagnostics(filePath);
    const semantic = this.service.getSemanticDiagnostics(filePath);

    const all = [...syntactic, ...semantic];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const d of all) {
      const line = d.file
        ? d.file.getLineAndCharacterOfPosition(d.start!).line + 1
        : 0;
      const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
      const fmt = `Line ${line}: ${msg}`;
      if (d.category === ts.DiagnosticCategory.Error) {
        errors.push(fmt);
      } else {
        warnings.push(fmt);
      }
    }

    return { errors, warnings };
  }

  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return null;

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    const defs = this.service.getDefinitionAtPosition(filePath, pos);

    if (!defs || defs.length === 0) return null;
    const def = defs[0];
    if (!def) return null;

    const defFile = def.fileName;
    const defStart = def.textSpan.start;

    let fileContent = "";
    if (this.files.has(defFile)) {
      fileContent = this.files.get(defFile)!.content;
    } else if (fs.existsSync(defFile)) {
      fileContent = fs.readFileSync(defFile, "utf-8");
    }

    if (!fileContent) return null;

    const tempSource = ts.createSourceFile(
      defFile,
      fileContent,
      ts.ScriptTarget.Latest,
    );
    const linePos = tempSource.getLineAndCharacterOfPosition(defStart);

    const lines = fileContent.split("\n");
    const preview = lines
      .slice(Math.max(0, linePos.line - 1), linePos.line + 2)
      .join("\n");

    return {
      file: defFile,
      line: linePos.line + 1,
      preview,
    };
  }

  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return null;

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    const info = this.service.getQuickInfoAtPosition(filePath, pos);

    if (!info) return null;

    const displayParts = ts.displayPartsToString(info.displayParts);
    const doc = ts.displayPartsToString(info.documentation);

    return `${displayParts}\n${doc}`;
  }

  async findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return [];

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    const impls = this.service.getImplementationAtPosition(filePath, pos);

    if (!impls) return [];

    return impls.map((impl) => {
      const implSource = this.service
        .getProgram()
        ?.getSourceFile(impl.fileName);
      const line = implSource
        ? implSource.getLineAndCharacterOfPosition(impl.textSpan.start).line + 1
        : 1;
      return { file: impl.fileName, line };
    });
  }

  async findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return [];

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    const refs = this.service.getReferencesAtPosition(filePath, pos);

    if (!refs) return [];

    return refs.map((ref) => {
      const refSource = this.service.getProgram()?.getSourceFile(ref.fileName);
      const line = refSource
        ? refSource.getLineAndCharacterOfPosition(ref.textSpan.start).line + 1
        : 1;
      return { file: ref.fileName, line };
    });
  }

  async getDocumentSymbols(filePath: string, content: string) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return [];

    const symbols: any[] = [];

    const visit = (node: ts.Node) => {
      let name = "";
      let kind = "";
      let children: any[] = [];

      // Determine node type and name
      if (ts.isFunctionDeclaration(node) && node.name) {
        name = node.name.text;
        kind = "Function";
        // Recurse for local functions/vars if needed, but usually flat is okay for top level
      } else if (ts.isClassDeclaration(node) && node.name) {
        name = node.name.text;
        kind = "Class";
        // Visit children (methods)
        ts.forEachChild(node, (child) => {
          if (ts.isMethodDeclaration(child) && ts.isIdentifier(child.name)) {
            const line =
              sourceFile.getLineAndCharacterOfPosition(child.getStart()).line +
              1;
            children.push({ name: child.name.text, kind: "Method", line });
          }
        });
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        name = node.name.text;
        kind = "Interface";
      } else if (ts.isVariableStatement(node)) {
        // Handle exposed const/let
        const list = node.declarationList;
        for (const decl of list.declarations) {
          if (ts.isIdentifier(decl.name)) {
            name = decl.name.text;
            kind = "Variable";
            // Note: handling only the first one if multiple allowed, but structure implies loop
            // We'll just push directly here
            const line =
              sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line +
              1;
            symbols.push({ name, kind, line });
            name = ""; // reset so we don't push again at end
          }
        }
      }

      if (name) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        symbols.push({
          name,
          kind,
          line,
          children: children.length > 0 ? children : undefined,
        });
      }
    };

    ts.forEachChild(sourceFile, visit);
    return symbols;
  }

  async getDocumentSymbolsWithDetails(
    filePath: string,
    content: string,
  ): Promise<import("./lspClient").DetailedSymbol[]> {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return [];

    const typeChecker = this.service.getProgram()?.getTypeChecker();
    const symbols: import("./lspClient").DetailedSymbol[] = [];

    const getJSDocComment = (node: ts.Node): string | undefined => {
      const jsDocs = ts.getJSDocCommentsAndTags(node);
      if (jsDocs.length === 0) return undefined;
      const comments: string[] = [];
      for (const doc of jsDocs) {
        if (ts.isJSDoc(doc) && doc.comment) {
          comments.push(
            typeof doc.comment === "string"
              ? doc.comment
              : doc.comment.map((c) => c.text).join(""),
          );
        }
      }
      return comments.length > 0 ? comments.join("\n") : undefined;
    };

    const hasExportModifier = (node: ts.Node): boolean => {
      if (!ts.canHaveModifiers(node)) return false;
      const modifiers = ts.getModifiers(node);
      if (!modifiers) return false;
      return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    };

    const getFunctionSignature = (
      node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction,
    ): string | undefined => {
      if (!typeChecker) return undefined;
      try {
        const signature = typeChecker.getSignatureFromDeclaration(node);
        if (signature) {
          return typeChecker.signatureToString(
            signature,
            node,
            ts.TypeFormatFlags.WriteArrowStyleSignature,
          );
        }
      } catch {
        // Fallback: build manually
      }
      return undefined;
    };

    const visit = (node: ts.Node) => {
      let sym: import("./lspClient").DetailedSymbol | null = null;

      if (ts.isFunctionDeclaration(node) && node.name) {
        sym = {
          name: node.name.text,
          kind: "Function",
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          signature: getFunctionSignature(node),
          docstring: getJSDocComment(node),
          exported: hasExportModifier(node),
        };
      } else if (ts.isClassDeclaration(node) && node.name) {
        const children: import("./lspClient").DetailedSymbol[] = [];
        ts.forEachChild(node, (child) => {
          if (ts.isMethodDeclaration(child) && ts.isIdentifier(child.name)) {
            children.push({
              name: child.name.text,
              kind: "Method",
              line:
                sourceFile.getLineAndCharacterOfPosition(child.getStart())
                  .line + 1,
              signature: getFunctionSignature(child),
              docstring: getJSDocComment(child),
            });
          } else if (
            ts.isPropertyDeclaration(child) &&
            ts.isIdentifier(child.name)
          ) {
            children.push({
              name: child.name.text,
              kind: "Property",
              line:
                sourceFile.getLineAndCharacterOfPosition(child.getStart())
                  .line + 1,
              docstring: getJSDocComment(child),
            });
          }
        });
        sym = {
          name: node.name.text,
          kind: "Class",
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          docstring: getJSDocComment(node),
          exported: hasExportModifier(node),
          children: children.length > 0 ? children : undefined,
        };
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        sym = {
          name: node.name.text,
          kind: "Interface",
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          docstring: getJSDocComment(node),
          exported: hasExportModifier(node),
        };
      } else if (ts.isVariableStatement(node)) {
        const isExported = hasExportModifier(node);
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            // Check if it's an arrow function assigned to const
            let signature: string | undefined;
            if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
              signature = getFunctionSignature(decl.initializer);
            }
            symbols.push({
              name: decl.name.text,
              kind: signature ? "Function" : "Variable",
              line:
                sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line +
                1,
              signature,
              docstring: getJSDocComment(node),
              exported: isExported,
            });
          }
        }
      }

      if (sym) {
        symbols.push(sym);
      }
    };

    ts.forEachChild(sourceFile, visit);
    return symbols;
  }

  async prepareCallHierarchy(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return [];

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    // TypeScript service doesn't have a direct 'prepareCallHierarchy' - we simulate it
    // by finding the symbol at position and returning it as a CallHierarchyItem
    const defs = this.service.getDefinitionAtPosition(filePath, pos);
    if (!defs || defs.length === 0) return [];

    const def = defs[0];
    if (!def) return [];

    const defSource = this.service.getProgram()?.getSourceFile(def.fileName);
    const defLine = defSource
      ? defSource.getLineAndCharacterOfPosition(def.textSpan.start).line + 1
      : 1;

    return [
      {
        name: def.name,
        kind: def.kind,
        file: def.fileName,
        line: defLine,
      },
    ];
  }

  async getOutgoingCalls(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    // Note: TS LanguageService doesn't expose provideCallHierarchyOutgoingCalls directly
    // widely available. We'll use a simplified AST traversal approach for now
    // to find calls within the function body at the given position.

    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return [];

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );

    // Find the function-like node containing the cursor
    let node = this.findContainerNode(sourceFile, pos);
    if (!node) return [];

    const calls: Array<{ name: string; file: string; line: number }> = [];

    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        // Resolve the called symbol
        const typeChecker = this.service.getProgram()?.getTypeChecker();
        // Note: Using private access to program/typechecker is tricky,
        // we'll try to find definition of the expression
        const exprStart = n.expression.getStart();
        const defs = this.service.getDefinitionAtPosition(filePath, exprStart);

        if (defs && defs.length > 0) {
          const def = defs[0];
          if (def) {
            const defSource = this.service
              .getProgram()
              ?.getSourceFile(def.fileName);
            const defLine = defSource
              ? defSource.getLineAndCharacterOfPosition(def.textSpan.start)
                  .line + 1
              : 1;

            calls.push({
              name: def.name,
              file: def.fileName,
              line: defLine,
            });
          }
        }
      }
      ts.forEachChild(n, visit);
    };

    visit(node);
    return calls;
  }

  private findContainerNode(
    sourceFile: ts.SourceFile,
    pos: number,
  ): ts.Node | null {
    let fond: ts.Node | null = null;

    const visit = (node: ts.Node) => {
      if (node.pos <= pos && node.end >= pos) {
        if (
          ts.isFunctionDeclaration(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node)
        ) {
          fond = node;
        }
        ts.forEachChild(node, visit);
      }
    };

    ts.forEachChild(sourceFile, visit);
    return fond;
  }
}

/**
 * ----------------------------------------------------------------------
 * TIER 2: Tree-Sitter Provider (Structure & Symbols)
 * ----------------------------------------------------------------------
 */
class TreeSitterProvider implements LanguageProvider {
  private parser: any = null;
  private lang: any = null;
  private isReady = false;

  private initPromise: Promise<void> | null = null;

  constructor(
    private languageName: string,
    private wasmPath: string,
  ) {
    this.initPromise = this.init();
  }

  private async init() {
    try {
      if (!fs.existsSync(this.wasmPath)) {
        console.error(`[TreeSitter] WASM file not found: ${this.wasmPath}`);
        return;
      }
      await Parser.init();
      this.lang = await Language.load(this.wasmPath);
      this.parser = new Parser();
      this.parser.setLanguage(this.lang);
      this.isReady = true;
    } catch (e) {
      console.error(`[TreeSitter] Init failed for ${this.languageName}:`, e);
    }
  }

  /**
   * Ensure initialization is complete before using the parser.
   */
  async ensureReady(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
    }
    return this.isReady;
  }

  isSupported(ext: string): boolean {
    return this.isReady;
  }

  async getDiagnostics() {
    return { errors: [], warnings: [] };
  }

  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    if (!this.parser || !this.lang) return null;
    const tree = this.parser.parse(content);

    // Simple heuristic: search for definition of symbol at cursor
    // Need exact logic for determining symbol at cursor for TS (row/col)
    // Assume we can get the text
    const lines = content.split("\n");
    const docLine = lines[line - 1] || "";
    // Crude extraction of word
    const match = docLine.slice(0, character).match(/[a-zA-Z0-9_]+$/);
    const suffix = docLine.slice(character).match(/^[a-zA-Z0-9_]+/);
    const word = (match ? match[0] : "") + (suffix ? suffix[0] : "");
    if (!word) return null;

    const symbols = await this.getDocumentSymbols(filePath, content);
    const found = this.findSymbolRecursive(symbols, word);
    if (found) {
      const preview = lines
        .slice(Math.max(0, found.line - 1), found.line + 2)
        .join("\n");
      return { file: filePath, line: found.line, preview };
    }
    return null;
  }

  private findSymbolRecursive(symbols: any[], name: string): any {
    for (const s of symbols) {
      if (s.name === name) return s;
      if (s.children) {
        const found = this.findSymbolRecursive(s.children, name);
        if (found) return found;
      }
    }
    return null;
  }

  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const def = await this.findDefinition(filePath, content, line, character);
    if (def && def.preview) {
      return `Definition:\n${def.preview}`;
    }
    return null;
  }

  async findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    return []; // Not implemented for TreeSitter yet
  }

  async findReferences() {
    return [];
  }

  async getDocumentSymbols(filePath: string, content: string) {
    if (!this.parser || !this.lang) return [];
    const tree = this.parser.parse(content);

    const ext = filePath.split(".").pop() || "";
    const queries = getQueriesForExtension(ext);
    if (!queries) return [];

    try {
      const query = new Query(this.lang, queries.definitions);
      const matches = query.matches(tree.rootNode);

      const symbols = matches.map((m: any) => {
        const nameNode = m.captures.find((c: any) => c.name === "name")?.node;
        const defNode = m.captures.find((c: any) => c.name === "def")?.node;

        // Determine kind based on node type
        let kind = "Function";
        if (defNode?.type.includes("class")) kind = "Class";
        else if (defNode?.type.includes("struct")) kind = "Struct";
        else if (defNode?.type.includes("enum")) kind = "Enum";
        else if (defNode?.type.includes("trait")) kind = "Trait";
        else if (defNode?.type.includes("interface")) kind = "Interface";

        return {
          name: nameNode?.text || "anonymous",
          kind,
          line: (defNode?.startPosition.row || 0) + 1,
          endLine: (defNode?.endPosition.row || 0) + 1,
        };
      });

      return this.buildHierarchy(
        symbols.sort((a: any, b: any) => a.line - b.line),
      );
    } catch {
      return [];
    }
  }

  /**
   * Build hierarchical symbol tree from flat list based on line ranges.
   */
  private buildHierarchy(flatSymbols: any[]): any[] {
    const root: any[] = [];
    const stack: any[] = [];

    for (const sym of flatSymbols) {
      // Pop items from stack that don't contain this symbol
      while (
        stack.length > 0 &&
        (stack[stack.length - 1].endLine < sym.line ||
          stack[stack.length - 1].endLine < sym.endLine) // Ensure proper nesting
      ) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(sym);
      } else {
        const parent = stack[stack.length - 1];
        if (!parent.children) parent.children = [];
        parent.children.push(sym);
      }

      // Push current symbol to stack if it can have children (classes, etc)
      // Function definitions can also have local functions
      stack.push(sym);
    }

    return root;
  }

  /**
   * Collect all nodes of specified types from the AST tree.
   * This is the proven approach from analyzer.ts.
   */
  private collectNodes(node: any, wantedTypes: Set<string>): any[] {
    const nodes: any[] = [];
    if (wantedTypes.has(node.type)) {
      nodes.push(node);
    }
    for (const child of node.children || []) {
      if (child !== null) {
        nodes.push(...this.collectNodes(child, wantedTypes));
      }
    }
    return nodes;
  }

  /**
   * Find the nearest parent node of specified types.
   */
  private findParent(node: any, wantedTypes: Set<string>): any | null {
    let curr = node.parent;
    while (curr) {
      if (wantedTypes.has(curr.type)) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  async getImports(
    filePath: string,
    content: string,
  ): Promise<Array<{ module: string; alias?: string; isRelative: boolean }>> {
    if (!this.parser || !this.lang) return [];
    const tree = this.parser.parse(content);
    if (!tree) return [];

    const imports: Array<{
      module: string;
      alias?: string;
      isRelative: boolean;
    }> = [];

    // Python imports - using AST walking like analyzer.ts
    if (this.languageName === "python") {
      const importNodes = this.collectNodes(
        tree.rootNode,
        new Set(["import_statement", "import_from_statement"]),
      );

      for (const node of importNodes) {
        if (node.type === "import_statement") {
          // import foo, import foo as bar
          const dottedNames = node.descendantsOfType?.("dotted_name") || [];
          for (const n of dottedNames) {
            if (n?.text) {
              imports.push({ module: n.text, isRelative: false });
            }
          }
          const aliased = node.descendantsOfType?.("aliased_import") || [];
          for (const n of aliased) {
            const mod = n.child?.(0)?.text;
            const alias = n.child?.(2)?.text;
            if (mod) {
              imports.push({ module: mod, alias, isRelative: false });
            }
          }
        } else if (node.type === "import_from_statement") {
          // from foo import bar
          const moduleName = node.childForFieldName?.("module_name")?.text;
          if (moduleName) {
            const isRelative = moduleName.startsWith(".");
            imports.push({ module: moduleName, isRelative });
          }
        }
      }
    }

    return imports;
  }

  async getOutgoingCalls(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<
    Array<{ name: string; file: string; line: number; sourceContext?: string }>
  > {
    if (!this.parser || !this.lang) return [];
    const tree = this.parser.parse(content);
    if (!tree) return [];

    const calls: Array<{
      name: string;
      file: string;
      line: number;
      sourceContext?: string;
    }> = [];

    // Python calls - using AST walking like analyzer.ts
    if (this.languageName === "python") {
      const defTypes = new Set(["function_definition", "class_definition"]);
      const callNodes = this.collectNodes(tree.rootNode, new Set(["call"]));

      for (const callNode of callNodes) {
        // Get function name from the call
        const funcNode = callNode.childForFieldName?.("function");
        if (!funcNode) continue;

        let funcName = funcNode.text;
        const callLine = callNode.startPosition.row + 1;

        // Handle attribute access (e.g., obj.method -> keep full path for resolution)
        // For the name, extract just the function/method name
        if (funcNode.type === "attribute") {
          const parts = funcName.split(".");
          funcName = parts[parts.length - 1] || funcName;
        }

        // Find the containing function/class to set sourceContext
        const parentDef = this.findParent(callNode, defTypes);
        const sourceContext = parentDef?.childForFieldName?.("name")?.text;

        calls.push({
          name: funcName,
          file: filePath,
          line: callLine,
          sourceContext,
        });
      }
    }

    return calls;
  }

  async getInheritance(
    filePath: string,
    content: string,
  ): Promise<Array<{ className: string; parentName: string; line: number }>> {
    if (!this.parser || !this.lang) return [];
    const tree = this.parser.parse(content);

    const ext = filePath.split(".").pop() || "";
    const queries = getQueriesForExtension(ext);
    if (!queries?.inheritance) return [];

    const inheritance: Array<{
      className: string;
      parentName: string;
      line: number;
    }> = [];

    try {
      const query = new Query(this.lang, queries.inheritance);
      const matches = query.matches(tree.rootNode);

      for (const m of matches) {
        const classNode = m.captures.find(
          (c: any) => c.name === "class_name",
        )?.node;
        const parentNode = m.captures.find(
          (c: any) => c.name === "parent",
        )?.node;

        if (classNode && parentNode) {
          inheritance.push({
            className: classNode.text,
            parentName: parentNode.text,
            line: classNode.startPosition.row + 1,
          });
        }
      }
    } catch {
      // Query failed
    }

    return inheritance;
  }
}

/**
 * ----------------------------------------------------------------------
 * TIER 3: Regex Provider (Fallback)
 * ----------------------------------------------------------------------
 */
class RegexProvider implements LanguageProvider {
  private config: Record<
    string,
    {
      defPattern: RegExp;
      kindMap: (match: RegExpMatchArray) => string;
      nameIdx: number;
      extensions: string[];
    }
  > = {
    python: {
      defPattern: /^\s*(?:async\s+)?(def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm,
      kindMap: (m) => (m[1] === "class" ? "Class" : "Function"),
      nameIdx: 2,
      extensions: ["py"],
    },
    rust: {
      defPattern:
        /^\s*(?:pub\s+)?(fn|struct|enum|trait|impl)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm,
      kindMap: (m) => {
        const type = m[1] || "";
        return type.charAt(0).toUpperCase() + type.slice(1);
      },
      nameIdx: 2,
      extensions: ["rs"],
    },
    go: {
      defPattern: /^\s*func\s+(?:.*?\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\(/gm,
      kindMap: () => "Function",
      nameIdx: 1,
      extensions: ["go"],
    },
    default: {
      defPattern: /^\s*(function|class|interface)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm,
      kindMap: (m) => m[1] || "Unknown",
      nameIdx: 2,
      extensions: [],
    },
  };

  isSupported(ext: string): boolean {
    return true;
  }

  private getConfig(ext: string) {
    for (const key in this.config) {
      if (this.config[key]!.extensions.includes(ext)) {
        return this.config[key]!;
      }
    }
    return this.config.default!;
  }

  async getDiagnostics() {
    return { errors: [], warnings: [] };
  }

  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const lines = content.split("\n");
    const docLine = lines[line - 1];
    if (!docLine) return null;

    // Extract word at cursor
    const match = docLine.slice(0, character).match(/[a-zA-Z0-9_]+$/);
    const suffix = docLine.slice(character).match(/^[a-zA-Z0-9_]+/);
    const word = (match ? match[0] : "") + (suffix ? suffix[0] : "");
    if (!word) return null;

    const ext = filePath.split(".").pop() || "";
    const cfg = this.getConfig(ext);

    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i]!;
      if (lineContent.includes(word)) {
        const regex = new RegExp(cfg.defPattern.source, "gm");
        let match;
        while ((match = regex.exec(lineContent)) !== null) {
          if (match[cfg.nameIdx] === word) {
            const preview = lines.slice(Math.max(0, i - 1), i + 2).join("\n");
            return { file: filePath, line: i + 1, preview };
          }
        }
      }
    }

    return null;
  }

  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const def = await this.findDefinition(filePath, content, line, character);
    if (def) return `Defined at line ${def.line}`;
    return null;
  }

  async findImplementation() {
    return [];
  }

  async findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const lines = content.split("\n");
    const docLine = lines[line - 1];
    if (!docLine) return [];

    const match = docLine.slice(0, character).match(/[a-zA-Z0-9_]+$/);
    const suffix = docLine.slice(character).match(/^[a-zA-Z0-9_]+/);
    const word = (match ? match[0] : "") + (suffix ? suffix[0] : "");
    if (!word) return [];

    const refs: Array<{ file: string; line: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes(word)) {
        refs.push({ file: filePath, line: i + 1 });
      }
    }
    return refs;
  }

  async getDocumentSymbols(filePath: string, content: string) {
    const ext = filePath.split(".").pop() || "";
    const cfg = this.getConfig(ext);

    const symbols: any[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const regex = new RegExp(cfg.defPattern.source, "g");
      let match;
      while ((match = regex.exec(lines[i]!)) !== null) {
        // Regex provider can't reliably determine end lines without parsing blocks
        // So we return flat list for now, or could try indentation heuristics
        symbols.push({
          name: match[cfg.nameIdx],
          kind: cfg.kindMap(match),
          line: i + 1,
          // Fallback: assume single line or try to guess?
          // For now, regex provider remains flat or we can try to guess scope by indentation
          endLine: i + 1, // Basic assumption
        });
      }
    }

    return symbols;
  }
}

/**
 * ----------------------------------------------------------------------
 * CLIENT: Universal LSP Client
 * ----------------------------------------------------------------------
 */
export class UniversalLSPClient {
  private tsProvider: TypeScriptProvider;
  private pyProvider: TreeSitterProvider;
  private regexProvider: RegexProvider;

  constructor(private rootPath: string = process.cwd()) {
    this.tsProvider = new TypeScriptProvider(rootPath);
    this.regexProvider = new RegexProvider();

    // Use import.meta.dir for Bun to get module-relative path
    // Fall back to rootPath for Node.js compatibility
    const moduleDir =
      typeof import.meta?.dir === "string"
        ? path.resolve(import.meta.dir, "../..")
        : rootPath;
    const pythonWasm = path.resolve(
      moduleDir,
      "parsers/tree-sitter-python.wasm",
    );
    this.pyProvider = new TreeSitterProvider("python", pythonWasm);
  }

  private async getProvider(filePath: string): Promise<LanguageProvider> {
    const ext = filePath.split(".").pop() || "";

    if (this.tsProvider.isSupported(ext)) {
      return this.tsProvider;
    }

    // For Python, ensure tree-sitter is ready before checking
    if (ext === "py") {
      const ready = await this.pyProvider.ensureReady();
      if (ready) {
        return this.pyProvider;
      }
    }

    return this.regexProvider;
  }

  async getDiagnostics(filePath: string, content: string) {
    const provider = await this.getProvider(filePath);
    return provider.getDiagnostics(filePath, content);
  }

  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.findDefinition(filePath, content, line, character);
  }

  async findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.findReferences(filePath, content, line, character);
  }

  async getDocumentSymbols(filePath: string, content: string) {
    const provider = await this.getProvider(filePath);
    return provider.getDocumentSymbols(filePath, content);
  }

  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.getSymbolInfo(filePath, content, line, character);
  }

  async findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.findImplementation(filePath, content, line, character);
  }

  async prepareCallHierarchy(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.prepareCallHierarchy
      ? provider.prepareCallHierarchy(filePath, content, line, character)
      : [];
  }

  async getIncomingCalls(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.getIncomingCalls
      ? provider.getIncomingCalls(filePath, content, line, character)
      : [];
  }

  async getOutgoingCalls(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.getOutgoingCalls
      ? provider.getOutgoingCalls(filePath, content, line, character)
      : [];
  }

  async searchWorkspaceSymbols(query: string, filePath: string) {
    const provider = await this.getProvider(filePath);
    return provider.searchWorkspaceSymbols
      ? provider.searchWorkspaceSymbols(query)
      : [];
  }

  async getImports(filePath: string, content: string) {
    const provider = await this.getProvider(filePath);
    return provider.getImports ? provider.getImports(filePath, content) : [];
  }

  async getInheritance(filePath: string, content: string) {
    const provider = await this.getProvider(filePath);
    return provider.getInheritance
      ? provider.getInheritance(filePath, content)
      : [];
  }

  async getDocumentSymbolsWithDetails(
    filePath: string,
    content: string,
  ): Promise<DetailedSymbol[]> {
    const provider = await this.getProvider(filePath);
    return provider.getDocumentSymbolsWithDetails
      ? provider.getDocumentSymbolsWithDetails(filePath, content)
      : this.fallbackToBasicSymbols(filePath, content);
  }

  private async fallbackToBasicSymbols(
    filePath: string,
    content: string,
  ): Promise<DetailedSymbol[]> {
    // Convert basic symbols to detailed format when provider doesn't support it
    const provider = await this.getProvider(filePath);
    const basic = await provider.getDocumentSymbols(filePath, content);
    return basic.map((s) => ({
      name: s.name,
      kind: s.kind,
      line: s.line,
      children: s.children?.map((c: any) => ({
        name: c.name,
        kind: c.kind,
        line: c.line,
      })),
    }));
  }

  isSupported(filePath: string): boolean {
    return true;
  }

  getSupportedExtensions(): string[] {
    return ["ts", "js", "py", "rs", "go", "*"];
  }

  shutdown() {
    // No-op
  }
}

let clientInstance: UniversalLSPClient | null = null;

export function getLSPClient(rootPath?: string): UniversalLSPClient {
  if (!clientInstance) {
    clientInstance = new UniversalLSPClient(rootPath);
  }
  return clientInstance;
}

export function resetLSPClient(): void {
  clientInstance = null;
}

export default UniversalLSPClient;
