import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage } from "@langchain/core/messages";
import Neo4jClient from "../neo4jcli";
import QdrantCli from "../qdrantcli";
import * as fs from "fs";
import * as path from "path";
import * as diff from "diff";

// ANSI color codes for diff styling
const COLORS = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

// Helper function to format diff lines with colors
function formatDiffLine(
  type: "added" | "removed" | "context",
  lineNum: string,
  content: string
): string {
  switch (type) {
    case "added":
      return `${COLORS.green}      [${lineNum}] + ${content}${COLORS.reset}\n`;
    case "removed":
      return `${COLORS.red}[${lineNum}]       - ${content}${COLORS.reset}\n`;
    case "context":
      return `${COLORS.dim}${lineNum}   ${content}${COLORS.reset}\n`;
  }
}

// Define the state of our graph
const AgentState = Annotation.Root({
  query: Annotation<string>(),
  repoPath: Annotation<string>(),
  repoName: Annotation<string>(),
  // Intermediate context gathering state
  qdrantResults: Annotation<any[]>(),
  filePaths: Annotation<string[]>(),
  // Final context state
  structuralContext: Annotation<string>(),
  codeContext: Annotation<string>(),
  thinkingProcess: Annotation<string>(),
  modifications: Annotation<string>(),
  diffs: Annotation<string>(),
  llmContext: Annotation<{
    thinkerPromptSize: number;
    coderPromptSize: number;
  }>(),
  error: Annotation<string | undefined>(),
  status: Annotation<string>(),
});

export default async function langgraphModify(
  query: string,
  neo4j: Neo4jClient,
  qdrant: QdrantCli,
  setStreamedText: (updater: (prev: string) => string) => void
) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

  const thinkerModel = new ChatOllama({
    model: "qwen3:8b",
    baseUrl: "http://localhost:11434",
    temperature: 0,
  });

  const coderModel = new ChatOllama({
    model: "llama3.1:latest",
    baseUrl: "http://localhost:11434",
    temperature: 0,
  });

  // --- Nodes ---

  // Step 1: Search Qdrant for semantic context
  const searchQdrantNode = async (state: typeof AgentState.State) => {
    setStreamedText(
      () => "🔍 [STEP 1/4] Searching Qdrant vector database...\n"
    );

    const searchResults = await qdrant.hybridSearch(
      state.repoName,
      state.query
    );

    // Extract file paths from results
    const filePaths: string[] = [];
    if (searchResults) {
      for (const res of searchResults as any[]) {
        const filePath = res.payload.filePath;
        if (filePath && !filePaths.includes(filePath)) {
          filePaths.push(filePath);
        }
      }
    }

    setStreamedText(
      (prev) => prev + `   Found ${filePaths.length} relevant files.\n`
    );

    return {
      qdrantResults: searchResults || [],
      filePaths,
      status: "qdrant_search_complete",
    };
  };

  // Step 2: Search Neo4j for structural context
  const searchNeo4jNode = async (state: typeof AgentState.State) => {
    setStreamedText(
      (prev) =>
        prev + "\n🧬 [STEP 2/4] Searching Neo4j for structural context...\n"
    );

    const words = state.query.split(/\W+/);
    let structuralContext = "";

    for (const word of words) {
      if (word.length < 3) continue;
      setStreamedText((prev) => prev + `   Inspecting symbol: "${word}"...\n`);
      const symContext = await neo4j.getContextBySymbol(word);
      if (symContext.length > 0) {
        structuralContext +=
          `\nSymbol info for "${word}":\n` +
          JSON.stringify(symContext, null, 2) +
          "\n";
      }
    }

    const foundSymbols = structuralContext.length > 0;
    setStreamedText(
      (prev) =>
        prev +
        `   ${
          foundSymbols
            ? "Structural context found."
            : "No structural context found."
        }\n`
    );

    return {
      structuralContext,
      status: "neo4j_search_complete",
    };
  };

  // Step 3: Read file contents from discovered paths
  const gatherFilesNode = async (state: typeof AgentState.State) => {
    setStreamedText(
      (prev) => prev + "\n📄 [STEP 3/4] Reading file contents...\n"
    );

    const fileContents: Record<string, string> = {};

    for (const filePath of state.filePaths || []) {
      const absPath = path.join(state.repoPath, "..", filePath);
      if (fs.existsSync(absPath)) {
        setStreamedText((prev) => prev + `   Reading: ${filePath}\n`);
        fileContents[filePath] = fs.readFileSync(absPath, "utf8");
      }
    }

    let codeContext = "";
    for (const [filePath, content] of Object.entries(fileContents)) {
      codeContext += `--- FILE: ${filePath} ---\n${content}\n\n`;
    }

    setStreamedText(
      (prev) =>
        prev + `   Loaded ${Object.keys(fileContents).length} file(s).\n`
    );

    return {
      codeContext,
      status: "files_gathered",
    };
  };

  // Step 4: Combine and finalize context
  const combineContextNode = async (state: typeof AgentState.State) => {
    setStreamedText((prev) => prev + "\n📦 [STEP 4/4] Combining context...\n");

    // Context is already combined in state, just validate
    const codeContextSize = state.codeContext?.length || 0;
    const structuralContextSize = state.structuralContext?.length || 0;

    setStreamedText(
      (prev) =>
        prev +
        `   Code context: ${
          codeContextSize > 0 ? "✓" : "✗"
        } (${codeContextSize} chars)\n` +
        `   Structural context: ${
          structuralContextSize > 0 ? "✓" : "✗"
        } (${structuralContextSize} chars)\n` +
        "\n✅ Context gathering complete.\n"
    );

    return {
      status: "context_gathered",
    };
  };

  const thinkNode = async (state: typeof AgentState.State) => {
    setStreamedText(
      (prev) =>
        prev + "\n🧠 [THINKING] Analyzing requirements (qwen3:8b)...\n\n"
    );

    const prompt = `
You are an expert software engineer. Your task is to plan how to modify the code in the project based on the user's request.
Context:
Structural Context: ${state.structuralContext}
File Contents: ${state.codeContext}

User Request: "${state.query}"

Instructions:
1. Analyze which files need to be changed.
2. Formulate a step-by-step plan for the modifications.
3. Be precise about what logic needs to be updated.

Output your plan as a detailed technical specification. Begin immediately.
`;

    const promptSize = prompt.length;
    setStreamedText(
      (prev) => prev + `   Thinker prompt size: ${promptSize} characters\n\n`
    );

    let thinkingProcess = "";
    const stream = await thinkerModel.stream([new HumanMessage(prompt)]);
    for await (const chunk of stream) {
      const content = chunk.content as string;
      thinkingProcess += content;
      setStreamedText((prev) => prev + content);
    }

    setStreamedText((prev) => prev + "\n\n💡 Planning complete.\n");

    return {
      thinkingProcess,
      llmContext: {
        ...state.llmContext,
        thinkerPromptSize: promptSize,
      },
      status: "planning_complete",
    };
  };

  const codeNode = async (state: typeof AgentState.State) => {
    setStreamedText(
      (prev) =>
        prev +
        "\n💻 [IMPLEMENTATION] Generating code changes (llama3.1:latest)...\n\n"
    );

    const prompt = `
You are an expert software engineer. Your task is to implement the modifications planned for the project.

User Request: "${state.query}"
Plan: ${state.thinkingProcess}
File Contents: ${state.codeContext}

Instructions:
1. Provide the FULL content of each modified file.
2. Format your response exactly as follows:
   FILE: <path/to/file>
   \`\`\`<language>
   <full file content>
   \`\`\`

Example:
FILE: sample/utils.py
\`\`\`python
# updated content
\`\`\`
`;

    const promptSize = prompt.length;
    setStreamedText(
      (prev) => prev + `   Coder prompt size: ${promptSize} characters\n\n`
    );

    let modifications = "";
    const stream = await coderModel.stream([new HumanMessage(prompt)]);
    for await (const chunk of stream) {
      const content = chunk.content as string;
      modifications += content;
      setStreamedText((prev) => prev + content);
    }

    setStreamedText((prev) => prev + "\n\n🛠️ Implementation complete.\n");

    return {
      modifications,
      llmContext: {
        ...state.llmContext,
        coderPromptSize: promptSize,
      },
      status: "code_generated",
    };
  };

  const verifyNode = async (state: typeof AgentState.State) => {
    setStreamedText((prev) => prev + "\n📉 [DIFF] Computing changes...\n");

    const fileBlocks = state.modifications
      .split(/FILE: /)
      .filter((b) => b.trim().length > 0);

    let allDiffs = "";

    for (const block of fileBlocks) {
      const lines = block.split("\n");
      const filePath = lines[0]?.trim();
      const codeMatch = block.match(/```(?:\w+)?\n([\s\S]*?)```/);

      if (filePath && codeMatch) {
        const newContent = codeMatch[1] ?? "";
        const absPath = path.join(state.repoPath, "..", filePath);

        let oldContent = "";
        if (fs.existsSync(absPath)) {
          oldContent = fs.readFileSync(absPath, "utf8");
        }

        const changes = diff.diffLines(oldContent, newContent);
        let oldLine = 1;
        let newLine = 1;
        let fileDiff = `\n--- DIFF FOR ${filePath} ---\n`;

        changes.forEach((part: diff.Change) => {
          const partLines = part.value.split("\n");
          if (partLines[partLines.length - 1] === "") partLines.pop();

          partLines.forEach((line: string) => {
            if (part.added) {
              fileDiff += formatDiffLine(
                "added",
                newLine.toString().padStart(3),
                line
              );
              newLine++;
            } else if (part.removed) {
              fileDiff += formatDiffLine(
                "removed",
                oldLine.toString().padStart(3),
                line
              );
              oldLine++;
            } else {
              const contextLineNum = `[${oldLine
                .toString()
                .padStart(3)}][${newLine.toString().padStart(3)}]`;
              fileDiff += formatDiffLine("context", contextLineNum, line);
              oldLine++;
              newLine++;
            }
          });
        });

        allDiffs += fileDiff;
      }
    }

    setStreamedText(
      (prev) => prev + "\n✨ Final results ready.\n\n" + allDiffs
    );

    return {
      diffs: allDiffs,
      status: "completed",
    };
  };

  // --- Graph Build ---

  const workflow = new StateGraph(AgentState)
    // Context gathering nodes (chunked)
    .addNode("searchQdrant", searchQdrantNode)
    .addNode("searchNeo4j", searchNeo4jNode)
    .addNode("gatherFiles", gatherFilesNode)
    .addNode("combineContext", combineContextNode)
    // Core processing nodes
    .addNode("think", thinkNode)
    .addNode("code", codeNode)
    .addNode("verify", verifyNode);

  // Connect chunked context gathering flow
  workflow.addEdge(START, "searchQdrant");
  workflow.addEdge("searchQdrant", "searchNeo4j");
  workflow.addEdge("searchNeo4j", "gatherFiles");
  workflow.addEdge("gatherFiles", "combineContext");
  // Continue to planning and implementation
  workflow.addEdge("combineContext", "think");
  workflow.addEdge("think", "code");
  workflow.addEdge("code", "verify");
  workflow.addEdge("verify", END);

  const app = workflow.compile();

  const finalState = await app.invoke({
    query,
    repoName,
    repoPath,
    status: "started",
    llmContext: { thinkerPromptSize: 0, coderPromptSize: 0 },
  });

  return finalState.diffs;
}
