import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage } from "@langchain/core/messages";
import Neo4jClient from "../neo4jcli";
import QdrantCli from "../qdrantcli";
import * as fs from "fs";
import * as path from "path";

// Define pending changes structure
export interface PendingChange {
  filePath: string;
  absPath: string;
  oldContent: string;
  newContent: string;
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
  updateOutput: (
    type: "log" | "diff" | "confirmation" | "markdown",
    content: string,
    title?: string,
    changes?: PendingChange[]
  ) => void,
  promptUserConfirmation: () => Promise<boolean>,
  setPendingChanges: (changes: PendingChange[]) => void
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

  // Step 1: Search Qdrant for semantic context
  const searchQdrantNode = async (state: typeof AgentState.State) => {
    updateOutput("log", "🔍 [STEP 1/4] Searching Qdrant vector database...");

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

    updateOutput("log", `Found ${filePaths.length} relevant files.`);

    return {
      qdrantResults: searchResults || [],
      filePaths,
      status: "qdrant_search_complete",
    };
  };

  // Step 2: Search Neo4j for structural context
  const searchNeo4jNode = async (state: typeof AgentState.State) => {
    updateOutput(
      "log",
      "🧬 [STEP 2/4] Searching Neo4j for structural context..."
    );

    const words = state.query.split(/\W+/);
    let structuralContext = "";

    for (const word of words) {
      if (word.length < 3) continue;
      updateOutput("log", `Inspecting symbol: "${word}"...`);
      const symContext = await neo4j.getContextBySymbol(word);
      if (symContext.length > 0) {
        structuralContext +=
          `Symbol info for "${word}":` +
          JSON.stringify(symContext, null, 2) +
          "";
      }
    }

    const foundSymbols = structuralContext.length > 0;
    updateOutput(
      "log",
      `${
        foundSymbols
          ? "Structural context found."
          : "No structural context found."
      }`
    );

    return {
      structuralContext,
      status: "neo4j_search_complete",
    };
  };

  // Step 3: Read file contents from discovered paths
  const gatherFilesNode = async (state: typeof AgentState.State) => {
    updateOutput("log", "📄 [STEP 3/4] Reading file contents...");

    const fileContents: Record<string, string> = {};

    for (const filePath of state.filePaths || []) {
      const absPath = path.join(state.repoPath, "..", filePath);
      if (fs.existsSync(absPath)) {
        updateOutput("log", `Reading: ${filePath}`);
        fileContents[filePath] = fs.readFileSync(absPath, "utf8");
      }
    }

    let codeContext = "";
    for (const [filePath, content] of Object.entries(fileContents)) {
      codeContext += `--- FILE: ${filePath} ---${content}`;
    }

    updateOutput("log", `Loaded ${Object.keys(fileContents).length} file(s).`);

    return {
      codeContext,
      status: "files_gathered",
    };
  };

  // Step 4: Combine and finalize context
  const combineContextNode = async (state: typeof AgentState.State) => {
    updateOutput("log", "📦 [STEP 4/4] Combining context...");

    // Context is already combined in state, just validate
    const codeContextSize = state.codeContext?.length || 0;
    const structuralContextSize = state.structuralContext?.length || 0;

    updateOutput(
      "log",
      `Code context: ${
        codeContextSize > 0 ? "✓" : "✗"
      } (${codeContextSize} chars)` +
        `Structural context: ${
          structuralContextSize > 0 ? "✓" : "✗"
        } (${structuralContextSize} chars)` +
        "✅ Context gathering complete."
    );

    return {
      status: "context_gathered",
    };
  };

  const thinkNode = async (state: typeof AgentState.State) => {
    updateOutput("log", "🧠 [THINKING] Analyzing requirements (qwen3:8b)...");

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
    updateOutput("log", `Thinker prompt size: ${promptSize} characters`);

    // Create a dedicated output item for the plan
    updateOutput("markdown", "", "Implementation Plan");
    let thinkingProcess = "";
    const stream = await thinkerModel.stream([new HumanMessage(prompt)]);
    for await (const chunk of stream) {
      const content = chunk.content as string;
      thinkingProcess += content;
      updateOutput("markdown", thinkingProcess, "Implementation Plan");
    }

    updateOutput("log", "Planning complete.");

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
    updateOutput(
      "log",
      "💻 [IMPLEMENTATION] Generating code changes (llama3.1:latest)..."
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
    updateOutput("log", `Coder prompt size: ${promptSize} characters`);

    let modifications = "";
    const stream = await coderModel.stream([new HumanMessage(prompt)]);
    for await (const chunk of stream) {
      const content = chunk.content as string;
      modifications += content;
      updateOutput("markdown", modifications, "Implementation Details");
    }

    updateOutput("log", "Implementation complete.");

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

    // Handle markdown formatting: **FILE: path** or FILE: path
    const fileBlocks = modifications
      .split(/\*{0,2}FILE:\s*/)
      .filter((b) => b.trim().length > 0);

    console.log(
      `[applyTargetedChanges] Found ${fileBlocks.length} file blocks`
    );

    for (const block of fileBlocks) {
      const lines = block.split("");
      // Clean up the filePath: remove trailing ** and whitespace
      let filePath = lines[0]?.trim().replace(/\*+$/, "").trim();

      console.log(`[applyTargetedChanges] Parsed filePath: "${filePath}"`);

      // Skip if filePath doesn't look like an actual file path
      // (must contain a / or have a file extension like .py, .ts, etc.)
      if (!filePath || (!filePath.includes("/") && !filePath.match(/\.\w+$/))) {
        console.log(
          `[applyTargetedChanges] Skipped invalid filePath: "${filePath}"`
        );
        continue;
      }

      // Build absolute path
      // Handle cases where the path might already start with "sample/" or be relative to it
      let relativePath = filePath;
      if (filePath.startsWith("sample/")) {
        relativePath = filePath.substring(7);
      }
      const absPath = path.join(repoPath, relativePath);

      console.log(
        `[applyTargetedChanges] Resolving: ${filePath} -> ${absPath}`
      );

      let oldContent = "";
      if (fs.existsSync(absPath)) {
        oldContent = fs.readFileSync(absPath, "utf8");
      }

      let newContent = oldContent;

      // Parse AT LINE sections - more flexible regex to handle variations
      // Handles: "AT LINE 1:" or "AT LINE 10 (after something):" etc.
      const atLineRegex =
        /AT LINE (\d+)[^:]*:\s*(?:REMOVE:\s*```(?:\w+)?([\s\S]*?)```)?[\s\S]*?(?:ADD:\s*```(?:\w+)?([\s\S]*?)```)?/gi;
      let match;
      const changes: { line: number; remove?: string; add?: string }[] = [];

      console.log(
        `[applyTargetedChanges] Parsing AT LINE sections for ${filePath}`
      );

      while ((match = atLineRegex.exec(block)) !== null) {
        const lineNum = match[1];
        console.log(
          `[applyTargetedChanges] Found AT LINE ${lineNum}, remove=${!!match[2]}, add=${!!match[3]}`
        );
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

      const contentLines = newContent.split("");
      for (const change of changes) {
        if (change.remove) {
          const removeLines = change.remove.split("");
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
          const addLines = change.add.split("");
          const insertIdx = change.line - 1;
          contentLines.splice(insertIdx, 0, ...addLines);
        }
      }

      newContent = contentLines.join("");

      pendingChanges.push({
        filePath,
        absPath,
        oldContent,
        newContent,
      });
    }

    return pendingChanges;
  };

  const verifyNode = async (state: typeof AgentState.State) => {
    updateOutput("log", "📉 [DIFF] Computing changes...");

    const pendingChanges = applyTargetedChanges(
      state.modifications,
      state.repoPath
    );

    console.log(
      `[verifyNode] Computed ${pendingChanges.length} pending changes:`
    );
    for (const change of pendingChanges) {
      console.log(`  - ${change.filePath} -> ${change.absPath}`);
    }

    setPendingChanges(pendingChanges);

    // Add a diff output item for the changes
    updateOutput("diff", "", "Code Changes", pendingChanges);

    updateOutput("log", `${pendingChanges.length} change(s) computed.`);

    return {
      pendingChanges,
      status: "awaiting_confirmation",
    };
  };

  const saveChangesNode = async (state: typeof AgentState.State) => {
    updateOutput("log", "💾 [SAVE] Waiting for user confirmation...");

    const confirmed = await promptUserConfirmation();

    if (confirmed) {
      const changesToSave = state.pendingChanges || [];
      console.log(
        `[saveChangesNode] confirmed=true, changesToSave.length=${changesToSave.length}`
      );

      updateOutput(
        "log",
        `✅ User confirmed. Saving ${changesToSave.length} change(s)...`
      );

      for (const change of changesToSave) {
        console.log(`[saveChanges] Writing to: ${change.absPath}`);
        console.log(
          `[saveChanges] newContent length: ${change.newContent?.length}`
        );
        try {
          fs.writeFileSync(change.absPath, change.newContent, "utf8");
          updateOutput("log", `✓ Saved: ${change.filePath}`);
        } catch (err) {
          console.error(`[saveChanges] Error writing file: ${err}`);
          updateOutput("log", `✗ Failed: ${change.filePath}`);
        }
      }

      updateOutput("log", "🎉 All changes saved successfully!");

      return {
        userConfirmed: true,
        status: "completed",
      };
    } else {
      updateOutput("log", "❌ Changes discarded by user.");

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

  const finalState = (await app.invoke({
    query,
    repoName,
    repoPath,
    status: "started",
    pendingChanges: [],
    userConfirmed: false,
    llmContext: { thinkerPromptSize: 0, coderPromptSize: 0 },
  })) as any;

  return {
    diffs: finalState.diffs,
    userConfirmed: finalState.userConfirmed,
    pendingChanges: finalState.pendingChanges || [],
  };
}
