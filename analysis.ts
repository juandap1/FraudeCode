import * as fs from "fs";
import { Parser, Language, Node } from "web-tree-sitter"; // Import from web-tree-sitter
import { useOllamaClient } from "./src/utils/ollamacli";

const GRAMMAR_PATH = "./parsers/tree-sitter-python.wasm";
const CODE_FILE = "./sample/sample.py";

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

const pyConfig = {
  language: GRAMMAR_PATH,
  name: "python",
  wantedNodes: new Set([
    "function_definition",
    "class_definition",
    "interface_definition",
  ]),
};

async function analyzeCode() {
  // --- 1. Initialize the Wasm Parser ---
  await Parser.init();

  const parser = new Parser();

  const pythonLang = await Language.load(GRAMMAR_PATH);

  // --- 2. Load the Wasm Grammar ---
  // This loads the language from the WASM file
  parser.setLanguage(pythonLang);

  // --- 3. Parse Code (same as before) ---
  const code = fs.readFileSync(CODE_FILE, "utf8");
  const tree = parser.parse(code);

  const chunks: any[] = [];
  if (!tree) return chunks;

  const wantedNodes = collectTreeNodes(tree.rootNode, pyConfig.wantedNodes);
  wantedNodes.sort((a, b) => a.startIndex - b.startIndex);

  let cursor = 0;
  let line = tree.rootNode.startPosition.row;

  for (const node of wantedNodes) {
    if (cursor < node.startIndex) {
      const gap = code.slice(cursor, node.startIndex);
      const gapSplits = await split(gap, line);
      chunks.push(...gapSplits);
    }

    const nodeContent = code.slice(node.startIndex, node.endIndex);
    const nodeLine = node.startPosition.row;
    const nodeSplits = await split(nodeContent, nodeLine);
    chunks.push(
      ...nodeSplits.map((n) => {
        return {
          ...n,
          symbol: node.childForFieldName("name")?.text,
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

  // Your walking/querying logic goes here...
  //   console.log("AST Root Node:", tree?.rootNode.toString());

  //   const callExpression = tree?.rootNode?.child(1)?.firstChild;
  //   console.log(callExpression);
  return chunks.map((chunk, i) => {
    return {
      ...chunk,
      filePath: CODE_FILE,
      language: pyConfig.name,
    };
  });
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

const MAX_TOKENS = 8192 * 3;

type Chunk = {
  id: string;
  document: string;
  startLine: number;
  endLine: number;
};

async function split(src: string, startLine: number): Promise<Chunk[]> {
  if (!src.trim()) return [];

  const lines = src.split("\n");
  const NEW_LINE_TOKEN = await embed("\n");

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
    const encodedLine = await embed(line);
    const lineTokens = encodedLine.length + NEW_LINE_TOKEN.length;
    if (currentTokens + lineTokens > MAX_TOKENS && currentLines.length > 0) {
      flush();
      splitStart += currentLines.length;
      currentLines = [];
      currentTokens = 0;
    }

    currentLines.push(line);
    currentTokens += lineTokens;
  }

  if (currentLines.length > 0) {
    flush();
  }

  return splits;
}

(async () => {
  let chunks = await analyzeCode();
  console.log("Chunks:", chunks.length);
  console.log(chunks);
})();
