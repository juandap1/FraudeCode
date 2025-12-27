import * as fs from "fs";
import { Parser, Language, Node } from "web-tree-sitter";
import QdrantCli from "./src/utils/qdrantcli";
import path from "path";
import ignore from "ignore";
import Neo4jClient from "./src/utils/neo4jcli";

const GRAMMAR_PATH = "./parsers/tree-sitter-python.wasm";

interface GitRepo {
  path: string;
  subPath?: string;
  name: string;
}

// Data structures for graph analysis
interface FileAnalysis {
  chunks: Chunk[];
  imports: ImportInfo[];
  definitions: DefinitionInfo[];
  calls: CallInfo[];
}

interface ImportInfo {
  module: string;
  alias?: string; // if "import numpy as np" -> alias "np"
}

interface DefinitionInfo {
  type: "function" | "class";
  name: string;
  startLine: number;
  parentName?: string;
}

interface CallInfo {
  sourceContext: string | undefined; // function name calling this
  functionName: string;
}

async function indexAllFiles(
  repo: GitRepo,
  client: QdrantCli,
  neo4jClient: Neo4jClient
) {
  const ig = ignore();
  ig.add(".gitignore");

  const gitignore = path.join(repo.path, ".gitignore");
  if (fs.existsSync(gitignore)) {
    const content = await fs.promises.readFile(gitignore, "utf8");
    ig.add(content);
  }

  let chunks: Chunk[] = [];

  const walkRepo = async (dir: string, subPath: string = "") => {
    const entries = await fs.promises
      .readdir(path.join(dir, subPath), { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      const absPath = path.join(dir, subPath, entry.name);
      const filePath = path.relative(repo.path, absPath);

      if (ig.ignores(filePath)) continue;

      if (entry.isDirectory()) {
        await walkRepo(absPath);
      } else if (entry.isFile()) {
        if (!filePath.endsWith(".py")) continue; // Only process python for graph for now

        // Create File Node
        await neo4jClient.addFileNode(filePath);

        const analysis = await analyzeCode(absPath, filePath);
        chunks.push(...analysis.chunks);

        console.log(
          `Processing ${filePath}: ${analysis.definitions.length} defs, ${analysis.calls.length} calls`
        );

        // Add Definitions (Functions/Classes)
        for (const def of analysis.definitions) {
          if (def.type === "function") {
            await neo4jClient.addFunctionNode(
              def.name,
              filePath,
              def.startLine,
              def.parentName
            );
          } else {
            await neo4jClient.addClassNode(
              def.name,
              filePath,
              def.startLine,
              def.parentName
            );
          }
        }

        // Add Imports
        for (const imp of analysis.imports) {
          await neo4jClient.addImportRelationship(filePath, imp.module);
        }

        // Add Calls
        for (const call of analysis.calls) {
          const parts = call.functionName.split(".");
          let targetFunc = call.functionName;
          let possibleFiles: string[] = [];

          if (parts.length > 1) {
            const prefix = parts[0];
            const lastPart = parts[parts.length - 1];
            if (lastPart) targetFunc = lastPart;

            if (prefix) {
              // Find import matching this prefix
              const imp = analysis.imports.find(
                (i) => i.alias === prefix || i.module === prefix
              );
              if (imp) {
                // Try resolution
                const currentDir = path.dirname(absPath);
                const candidateStr = imp.module.replace(/\./g, "/"); // primitive package to path
                const candidateSibling = path.join(
                  currentDir,
                  candidateStr + ".py"
                );
                if (fs.existsSync(candidateSibling)) {
                  possibleFiles.push(
                    path.relative(repo.path, candidateSibling)
                  );
                } else {
                  possibleFiles.push(imp.module); // fallback
                }
              }
            }
          }

          await neo4jClient.addCallRelationship(
            filePath,
            call.sourceContext,
            targetFunc,
            possibleFiles
          );
        }

        if (chunks.length > 100) {
          chunks = await addBatch(client, repo.name, chunks);
        }
      }
    }
  };

  await walkRepo(repo.path, repo?.subPath || "");
  while (chunks.length > 0) {
    chunks = await addBatch(client, repo.name, chunks);
  }
}

async function addBatch(
  qdrantCli: QdrantCli,
  collectionName: string,
  chunks: Chunk[],
  batchSize: number = 100
) {
  console.log("Adding batch to Qdrant");
  const batch = chunks.slice(0, batchSize);
  const points = await Promise.all(
    batch.map(async (chunk) => {
      const { id, document, ...metadata } = chunk;
      const denseVector = await qdrantCli.embed(document);
      const sparseVector = qdrantCli.getSparseVector(document);
      return {
        id,
        vector: {
          "arctic-dense": denseVector,
          "code-sparse": sparseVector,
        },
        payload: { ...metadata, rawDocument: document },
      };
    })
  );
  await qdrantCli.upsertCollections(collectionName, points);
  return chunks.slice(batchSize);
}

const pyConfig = {
  language: GRAMMAR_PATH,
  name: "python",
  wantedNodes: new Set(["function_definition", "class_definition"]),
};

async function analyzeCode(
  absPath: string,
  relPath: string
): Promise<FileAnalysis> {
  await Parser.init();
  const parser = new Parser();
  const pythonLang = await Language.load(GRAMMAR_PATH);
  parser.setLanguage(pythonLang);

  const code = fs.readFileSync(absPath, "utf8");
  const tree = parser.parse(code);

  const chunks: Chunk[] = [];
  const imports: ImportInfo[] = [];
  const definitions: DefinitionInfo[] = [];
  const calls: CallInfo[] = [];

  if (!tree) return { chunks, imports, definitions, calls };

  // --- Extract Imports ---
  const importNodes = collectTreeNodes(
    tree.rootNode,
    new Set(["import_statement", "import_from_statement"])
  );
  for (const node of importNodes) {
    if (node.type === "import_statement") {
      node.descendantsOfType("dotted_name").forEach((n) => {
        if (n && n.text) imports.push({ module: n.text });
      });
      node.descendantsOfType("aliased_import").forEach((n) => {
        if (n) {
          const mod = n.child(0)?.text;
          const alias = n.child(2)?.text;
          if (mod) imports.push({ module: mod, alias });
        }
      });
    } else if (node.type === "import_from_statement") {
      const moduleName = node.childForFieldName("module_name")?.text;
      if (moduleName) {
        imports.push({ module: moduleName });
      }
    }
  }

  // --- Extract Structure and Chunks ---
  const wantedNodes = collectTreeNodes(tree.rootNode, pyConfig.wantedNodes);
  wantedNodes.sort((a, b) => a.startIndex - b.startIndex);

  let cursor = 0;
  let line = tree.rootNode.startPosition.row;

  for (const node of wantedNodes) {
    // 1. Definition Info
    const name = node.childForFieldName("name")?.text;
    if (name) {
      const parentDef = findWantedParent(node, pyConfig.wantedNodes);
      const parentName = parentDef
        ? parentDef.childForFieldName("name")?.text
        : undefined;

      definitions.push({
        type: node.type === "class_definition" ? "class" : "function",
        name: name,
        startLine: node.startPosition.row + 1,
        parentName,
      });
    }

    // 2. Extract Calls within this definition
    const callNodes = collectTreeNodes(node, new Set(["call"]));
    for (const callNode of callNodes) {
      let funcName = callNode.childForFieldName("function")?.text;
      if (funcName) {
        calls.push({ sourceContext: name, functionName: funcName });
      }
    }

    // 3. Chunking
    if (cursor < node.startIndex) {
      const gap = code.slice(cursor, node.startIndex);
      const gapSplits = await split(gap, line);
      chunks.push(...gapSplits);
    }

    const parentNode = findWantedParent(node, pyConfig.wantedNodes);
    const parentSymbol = parentNode
      ? parentNode.childForFieldName("name")?.text
      : undefined;

    const nodeContent = code.slice(node.startIndex, node.endIndex);
    const nodeLine = node.startPosition.row;
    const nodeSplits = await split(nodeContent, nodeLine);
    chunks.push(
      ...nodeSplits.map((n) => {
        return {
          ...n,
          symbol: name,
          parent: parentSymbol,
        };
      })
    );

    cursor = node.endIndex;
    line = node.endPosition.row;
  }

  if (cursor < code.length) {
    const tail = code.slice(cursor);
    const tailSplits = await split(tail, line);
    chunks.push(...tailSplits);
  }

  // Top level calls
  const allCalls = collectTreeNodes(tree.rootNode, new Set(["call"]));
  for (const callNode of allCalls) {
    const parentDef = findWantedParent(callNode, pyConfig.wantedNodes);
    if (!parentDef) {
      let funcName = callNode.childForFieldName("function")?.text;
      if (funcName) {
        calls.push({ sourceContext: undefined, functionName: funcName });
      }
    }
  }

  return {
    chunks: chunks.map((chunk, i) => ({
      ...chunk,
      filePath: relPath,
      language: pyConfig.name,
    })),
    imports,
    definitions,
    calls,
  };
}

function collectTreeNodes(node: Node, wantedNodes: Set<string>): Node[] {
  const treeNodes: Node[] = [];
  if (wantedNodes.has(node.type)) {
    treeNodes.push(node);
  }
  for (const child of node.children) {
    if (child === null) continue;
    treeNodes.push(...collectTreeNodes(child, wantedNodes));
  }
  return treeNodes;
}

function findWantedParent(node: Node, wantedConfigs: Set<string>): Node | null {
  let curr = node.parent;
  while (curr) {
    if (wantedConfigs.has(curr.type)) {
      return curr;
    }
    curr = curr.parent;
  }
  return null;
}

const MAX_TOKENS = 8192;

type Chunk = {
  id: string;
  document: string;
  startLine: number;
  endLine: number;
  parent?: string;
  symbol?: string;
  filePath?: string;
  language?: string;
};

async function split(src: string, startLine: number): Promise<Chunk[]> {
  if (!src.trim()) return [];
  const lines = src.split("\n");
  const NEW_LINE_TOKEN = "\n";
  let currentLines: string[] = [];
  let currentTokens = 0;
  let splitStart = startLine;
  const splits: Chunk[] = [];
  const flush = () => {
    splits.push({
      id: crypto.randomUUID(),
      document: currentLines.join("\n"),
      startLine: splitStart,
      endLine: splitStart + currentLines.length,
    });
  };
  for (const line of lines) {
    const lineTokens = line.length + NEW_LINE_TOKEN.length;
    if (currentTokens + lineTokens > MAX_TOKENS && currentLines.length > 0) {
      flush();
      splitStart += currentLines.length;
      currentLines = [];
      currentTokens = 0;
    }
    currentLines.push(line);
    currentTokens += lineTokens;
  }
  if (currentLines.length > 0) flush();
  return splits;
}

(async () => {
  let repo = {
    path: "/Users/mbranni03/Documents/GitHub/FraudeCode",
    subPath: "sample",
    name: "sample",
  };
  let client = new QdrantCli();
  let neo4jClient = new Neo4jClient();
  await neo4jClient.healthCheck();
  await client.init();
  await client.getOrCreateCollection(repo.name);
  await indexAllFiles(repo, client, neo4jClient);
  console.log("Indexing finished.");
})();
