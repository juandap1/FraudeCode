import * as fs from "fs";
import { Parser, Language } from "web-tree-sitter"; // Import from web-tree-sitter

const GRAMMAR_PATH = "./parsers/tree-sitter-python.wasm";
const CODE_FILE = "./sample/sample.py";

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

  // Your walking/querying logic goes here...
  console.log("AST Root Node:", tree?.rootNode.toString());
}

analyzeCode().catch(console.error);
