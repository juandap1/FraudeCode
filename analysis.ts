import * as fs from "fs";
import { Parser, Language, Node } from "web-tree-sitter";
import QdrantCli from "./src/utils/qdrantcli";
import path from "path";
import ignore from "ignore";

const GRAMMAR_PATH = "./parsers/tree-sitter-python.wasm";
const CODE_FILE = "./sample/sample.py";

const OLLAMA_URL = "http://localhost:11434/api/embeddings";
const MODEL = "snowflake-arctic-embed:latest";

interface GitRepo {
  path: string;
  subPath?: string;
  name: string;
}

async function indexAllFiles(repo: GitRepo, client: QdrantCli) {
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
        const fileChunks = await analyzeCode(filePath);
        chunks.push(...fileChunks);
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
  console.log("Adding batch");
  const batch = chunks.slice(0, batchSize);
  console.log(batch.length);
  console.log(batch[0]);
  const points = await Promise.all(
    batch.map(async (chunk) => {
      const { id, document, ...metadata } = chunk;
      return {
        id,
        vector: await embed(document),
        payload: { ...metadata, rawDocument: document },
      };
    })
  );
  await qdrantCli.upsertCollections(collectionName, points);
  return chunks.slice(batchSize);
}

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

async function analyzeCode(filePath: string) {
  console.log("Analyzing file: ", filePath);
  // --- 1. Initialize the Wasm Parser ---
  await Parser.init();

  const parser = new Parser();

  const pythonLang = await Language.load(GRAMMAR_PATH);

  // --- 2. Load the Wasm Grammar ---
  // This loads the language from the WASM file
  parser.setLanguage(pythonLang);

  // --- 3. Parse Code (same as before) ---
  const code = fs.readFileSync(filePath, "utf8");
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
          symbol: node.childForFieldName("name")?.text,
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

  // Your walking/querying logic goes here...
  //   console.log("AST Root Node:", tree?.rootNode.toString());

  //   const callExpression = tree?.rootNode?.child(1)?.firstChild;
  //   console.log(callExpression);
  return chunks.map((chunk, i) => {
    return {
      ...chunk,
      filePath: filePath,
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
    // const encodedLine = await tokenize(LLM_MODEL, line);
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

  if (currentLines.length > 0) {
    flush();
  }

  return splits;
}

(async () => {
  //   let analysis = await analyzeCode(CODE_FILE);
  //   console.log(analysis);
  //   console.log(await embed("test"));
  let repo = {
    path: "/Users/mbranni03/Documents/GitHub/FraudeCode",
    subPath: "sample",
    name: "sample",
  };
  let client = new QdrantCli();
  await client.getOrCreateCollection(repo.name);
  await indexAllFiles(repo, client);
  //   const res = await client.searchCollections(
  //     repo.name,
  //     await embed("calculate")
  //   );
  //   console.log(res.points);
})();
