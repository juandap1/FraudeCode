import * as fs from "fs";
import { Parser, Language, Node } from "web-tree-sitter";
import type {
  FileAnalysis,
  ImportInfo,
  DefinitionInfo,
  CallInfo,
} from "../../types/analysis";
import { split } from "../../utils/Chunker";

const GRAMMAR_PATH = "./parsers/tree-sitter-python.wasm";

const pyConfig = {
  language: GRAMMAR_PATH,
  name: "python",
  wantedNodes: new Set(["function_definition", "class_definition"]),
};

export async function analyzeCode(
  absPath: string,
  relPath: string
): Promise<FileAnalysis> {
  await Parser.init();
  const parser = new Parser();
  const pythonLang = await Language.load(GRAMMAR_PATH);
  parser.setLanguage(pythonLang);

  const code = fs.readFileSync(absPath, "utf8");
  const tree = parser.parse(code);

  const chunks: any[] = [];
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
  let line = tree.rootNode.startPosition.row + 1;

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
    const nodeSplits = await split(nodeContent, nodeLine + 1);
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
    line = node.endPosition.row + 1;
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
