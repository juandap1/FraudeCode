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

// Define pending changes structure
export interface PendingChange {
  filePath: string;
  absPath: string;
  oldContent: string;
  newContent: string;
  diff: string;
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
  pendingChanges: Annotation<PendingChange[]>(),
  userConfirmed: Annotation<boolean>(),
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
  setStreamedText: (updater: (prev: string) => string) => void,
  promptUserConfirmation: () => Promise<boolean>
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
You are an expert software engineer. Your task is to implement ONLY the necessary modifications to the project.

User Request: "${state.query}"
Plan: ${state.thinkingProcess}
File Contents: ${state.codeContext}

Instructions:
1. Provide ONLY the targeted changes needed - do NOT rewrite entire files.
2. For each file, specify which lines to ADD and which to REMOVE.
3. Format your response exactly as follows:

FILE: <path/to/file>
AT LINE <line_number>:
REMOVE:
\`\`\`<language>
<lines to remove - exact content>
\`\`\`
ADD:
\`\`\`<language>
<lines to add - replacement content>
\`\`\`

Example for adding a new import and modifying a function:

FILE: sample/utils.py
AT LINE 1:
ADD:
\`\`\`python
import new_module
\`\`\`

AT LINE 15:
REMOVE:
\`\`\`python
def old_function():
    return "old"
\`\`\`
ADD:
\`\`\`python
def new_function():
    return "new"
\`\`\`

IMPORTANT:
- Only include lines that actually change
- Keep the REMOVE and ADD blocks as small as possible
- Include enough context in REMOVE to uniquely identify the location
- If only adding (no removal), omit the REMOVE block
- If only removing (no addition), omit the ADD block
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

  // Helper to parse targeted modifications and apply them to files
  const applyTargetedChanges = (
    modifications: string,
    repoPath: string
  ): PendingChange[] => {
    const pendingChanges: PendingChange[] = [];
    const fileBlocks = modifications
      .split(/FILE: /)
      .filter((b) => b.trim().length > 0);

    for (const block of fileBlocks) {
      const lines = block.split("\n");
      const filePath = lines[0]?.trim();

      // Skip if filePath doesn't look like an actual file path
      // (must contain a / or have a file extension like .py, .ts, etc.)
      if (!filePath || (!filePath.includes("/") && !filePath.match(/\.\w+$/))) {
        continue;
      }

      const absPath = path.join(repoPath, "..", filePath);
      let oldContent = "";
      if (fs.existsSync(absPath)) {
        oldContent = fs.readFileSync(absPath, "utf8");
      }

      let newContent = oldContent;

      // Parse AT LINE sections
      const atLineRegex =
        /AT LINE (\d+):\s*(?:REMOVE:\s*```(?:\w+)?\n([\s\S]*?)```)?\s*(?:ADD:\s*```(?:\w+)?\n([\s\S]*?)```)?/g;
      let match;
      const changes: { line: number; remove?: string; add?: string }[] = [];

      while ((match = atLineRegex.exec(block)) !== null) {
        const lineNum = match[1];
        if (lineNum) {
          changes.push({
            line: parseInt(lineNum, 10),
            remove: match[2]?.trimEnd(),
            add: match[3]?.trimEnd(),
          });
        }
      }

      // Apply changes in reverse order to preserve line numbers
      changes.sort((a, b) => b.line - a.line);

      const contentLines = newContent.split("\n");
      for (const change of changes) {
        if (change.remove) {
          const removeLines = change.remove.split("\n");
          // Find and remove the matching lines
          const startIdx = change.line - 1;
          let matchFound = true;
          for (let i = 0; i < removeLines.length; i++) {
            const contentLine = contentLines[startIdx + i];
            const removeLine = removeLines[i];
            if (contentLine?.trim() !== removeLine?.trim()) {
              matchFound = false;
              break;
            }
          }
          if (matchFound) {
            contentLines.splice(startIdx, removeLines.length);
          }
        }
        if (change.add) {
          const addLines = change.add.split("\n");
          const insertIdx = change.line - 1;
          contentLines.splice(insertIdx, 0, ...addLines);
        }
      }

      newContent = contentLines.join("\n");

      // Compute diff
      const diffChanges = diff.diffLines(oldContent, newContent);
      let oldLine = 1;
      let newLine = 1;
      let fileDiff = `\n--- DIFF FOR ${filePath} ---\n`;

      diffChanges.forEach((part: diff.Change) => {
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

      pendingChanges.push({
        filePath,
        absPath,
        oldContent,
        newContent,
        diff: fileDiff,
      });
    }

    return pendingChanges;
  };

  const verifyNode = async (state: typeof AgentState.State) => {
    setStreamedText((prev) => prev + "\n📉 [DIFF] Computing changes...\n");

    const pendingChanges = applyTargetedChanges(
      state.modifications,
      state.repoPath
    );

    let allDiffs = "";
    for (const change of pendingChanges) {
      allDiffs += change.diff;
    }

    setStreamedText((prev) => prev + "\n✨ Changes computed.\n\n" + allDiffs);

    return {
      diffs: allDiffs,
      pendingChanges,
      status: "awaiting_confirmation",
    };
  };

  const saveChangesNode = async (state: typeof AgentState.State) => {
    setStreamedText(
      (prev) => prev + "\n💾 [SAVE] Waiting for user confirmation...\n"
    );

    const confirmed = await promptUserConfirmation();

    if (confirmed) {
      setStreamedText((prev) => prev + "\n✅ Saving changes...\n");

      for (const change of state.pendingChanges || []) {
        fs.writeFileSync(change.absPath, change.newContent, "utf8");
        setStreamedText((prev) => prev + `   ✓ Saved: ${change.filePath}\n`);
      }

      setStreamedText(
        (prev) => prev + "\n🎉 All changes saved successfully!\n"
      );

      return {
        userConfirmed: true,
        status: "completed",
      };
    } else {
      setStreamedText((prev) => prev + "\n❌ Changes discarded by user.\n");

      return {
        userConfirmed: false,
        status: "cancelled",
      };
    }
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
    .addNode("verify", verifyNode)
    .addNode("saveChanges", saveChangesNode);

  // Connect chunked context gathering flow
  workflow.addEdge(START, "searchQdrant");
  workflow.addEdge("searchQdrant", "searchNeo4j");
  workflow.addEdge("searchNeo4j", "gatherFiles");
  workflow.addEdge("gatherFiles", "combineContext");
  // Continue to planning and implementation
  workflow.addEdge("combineContext", "think");
  workflow.addEdge("think", "code");
  workflow.addEdge("code", "verify");
  workflow.addEdge("verify", "saveChanges");
  workflow.addEdge("saveChanges", END);

  const app = workflow.compile();

  const finalState = await app.invoke({
    query,
    repoName,
    repoPath,
    status: "started",
    pendingChanges: [],
    userConfirmed: false,
    llmContext: { thinkerPromptSize: 0, coderPromptSize: 0 },
  });

  return {
    diffs: finalState.diffs,
    userConfirmed: finalState.userConfirmed,
    pendingChanges: finalState.pendingChanges,
  };
}
