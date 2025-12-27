import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import Neo4jClient from "../neo4jcli";
import QdrantCli from "../qdrantcli";
import * as fs from "fs";
import * as path from "path";

// Prompts
import ModificationThinkPrompt from "../../types/prompts/modify/Think";
import ModificationCodeChangesPrompt from "../../types/prompts/modify/CodeChanges";
import type { ChatOllama } from "@langchain/ollama";

// Define pending changes structure
export interface PendingChange {
  filePath: string;
  absPath: string;
  oldContent: string;
  newContent: string;
}

// Helper to parse targeted modifications and apply them to files
export const applyTargetedChanges = (
  modifications: string,
  repoPath: string,
  updateOutput: (type: "log", content: string) => void
): PendingChange[] => {
  const pendingChanges: PendingChange[] = [];

  // Split by "FILE:" regardless of markdown bolding
  const fileBlocks = modifications
    .split(/\bFILE:\s*/i)
    .filter((b) => b.trim().length > 0);

  // updateOutput(
  //   "log",
  //   `[applyTargetedChanges] Found ${fileBlocks.length} potential file blocks`
  // );

  for (const block of fileBlocks) {
    const blockLines = block.split(/\r?\n/);
    let filePath = blockLines[0]
      ?.trim()
      .replace(/\*+$/, "")
      .replace(/^\*+/, "")
      .trim();

    // updateOutput(
    //   "log",
    //   `[applyTargetedChanges] Parsed filePath: "${filePath}"`
    // );

    if (!filePath || (!filePath.includes("/") && !filePath.match(/\.\w+$/))) {
      // updateOutput(
      //   "log",
      //   `[applyTargetedChanges] Skipped invalid filePath: "${filePath}"`
      // );
      continue;
    }

    let relativePath = filePath;
    if (filePath.startsWith("sample/")) {
      relativePath = filePath.substring(7);
    }
    const absPath = path.join(repoPath, relativePath);

    // updateOutput(
    //   "log",
    //   `[applyTargetedChanges] Resolving: ${filePath} -> ${absPath}`
    // );

    let oldContent = "";
    if (fs.existsSync(absPath)) {
      oldContent = fs.readFileSync(absPath, "utf8");
    } else {
      updateOutput(
        "log",
        `[applyTargetedChanges] WARNING: File does not exist: ${absPath}`
      );
    }

    let newContent = oldContent;

    // Segment the block into "AT LINE" chunks
    const atLineSections = block.split(/\bAT LINE\s+/i);
    const changes: { line: number; remove?: string; add?: string }[] = [];

    // The first segment (index 0) is usually the filename/intro, so start from 1
    for (let i = 1; i < atLineSections.length; i++) {
      const section = atLineSections[i];
      if (!section) continue;

      // Match the line number at the start of the section
      const lineMatch = section.match(/^(\d+)/);
      if (!lineMatch) continue;

      const lineNum = parseInt(lineMatch[1]!, 10);

      // Look for REMOVE and ADD blocks in this section
      const removeMatch = section.match(
        /REMOVE:\s*```(?:\w+)?\r?\n([\s\S]*?)```/i
      );
      const addMatch = section.match(/ADD:\s*```(?:\w+)?\r?\n([\s\S]*?)```/i);

      if (removeMatch || addMatch) {
        updateOutput(
          "log",
          `[applyTargetedChanges] Found AT LINE ${lineNum}, remove=${!!removeMatch}, add=${!!addMatch}`
        );
        changes.push({
          line: lineNum,
          remove:
            removeMatch && removeMatch[1]
              ? removeMatch[1].trimEnd()
              : undefined,
          add: addMatch && addMatch[1] ? addMatch[1].trimEnd() : undefined,
        });
      }
    }

    if (changes.length === 0) {
      updateOutput(
        "log",
        `[applyTargetedChanges] No valid AT LINE changes found for ${filePath}`
      );
    }

    // Apply changes in reverse order to preserve line numbers
    changes.sort((a, b) => b.line - a.line);

    let contentLines = newContent.split(/\r?\n/);

    for (const change of changes) {
      const startIdx = change.line - 1;

      if (change.remove) {
        const removeLines = change.remove.split(/\r?\n/);
        updateOutput(
          "log",
          `[applyTargetedChanges] Attempting removal at line ${change.line} (${removeLines.length} lines)`
        );

        let matchFound = true;
        for (let i = 0; i < removeLines.length; i++) {
          const contentLine = contentLines[startIdx + i];
          const removeLine = removeLines[i];
          if (contentLine?.trim() !== removeLine?.trim()) {
            updateOutput(
              "log",
              `[applyTargetedChanges] Mismatch at line ${
                startIdx + i + 1
              }: expected "${removeLine?.trim()}", found "${contentLine?.trim()}"`
            );
            matchFound = false;
            break;
          }
        }

        if (matchFound) {
          contentLines.splice(startIdx, removeLines.length);
          updateOutput(
            "log",
            `[applyTargetedChanges] Successfully removed ${removeLines.length} lines`
          );
        } else {
          updateOutput(
            "log",
            `[applyTargetedChanges] FAILED to remove lines at ${change.line} due to mismatch`
          );
        }
      }

      if (change.add) {
        const addLines = change.add.split(/\r?\n/);
        updateOutput(
          "log",
          `[applyTargetedChanges] Adding ${addLines.length} lines at position ${change.line}`
        );
        contentLines.splice(startIdx, 0, ...addLines);
      }
    }

    newContent = contentLines.join("\n");

    pendingChanges.push({
      filePath,
      absPath,
      oldContent,
      newContent,
    });
  }

  return pendingChanges;
};

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
  thinkerModel: ChatOllama,
  coderModel: ChatOllama,
  updateOutput: (
    type: "log" | "diff" | "confirmation" | "markdown",
    content: string,
    title?: string,
    changes?: PendingChange[]
  ) => void,
  promptUserConfirmation: () => Promise<boolean>,
  setPendingChanges: (changes: PendingChange[]) => void,
  signal?: AbortSignal
) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

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

    const prompt = ModificationThinkPrompt(
      state.structuralContext,
      state.codeContext,
      state.query
    );

    const promptSize = prompt.length;
    updateOutput("log", `Thinker prompt size: ${promptSize} characters`);

    // Create a dedicated output item for the plan
    updateOutput("markdown", "", "Implementation Plan");
    let thinkingProcess = "";
    const stream = await thinkerModel.stream([new HumanMessage(prompt)], {
      signal,
    });
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

    const prompt = ModificationCodeChangesPrompt(
      state.codeContext,
      state.thinkingProcess,
      state.query
    );

    const promptSize = prompt.length;
    updateOutput("log", `Coder prompt size: ${promptSize} characters`);

    let modifications = "";
    const stream = await coderModel.stream([new HumanMessage(prompt)], {
      signal,
    });
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

  const verifyNode = async (state: typeof AgentState.State) => {
    updateOutput("log", "📉 [DIFF] Computing changes...");

    const pendingChanges = applyTargetedChanges(
      state.modifications,
      state.repoPath,
      updateOutput as any
    );

    updateOutput(
      "log",
      `[verifyNode] Computed ${pendingChanges.length} pending changes:`
    );
    for (const change of pendingChanges) {
      updateOutput("log", `  - ${change.filePath} -> ${change.absPath}`);
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
      updateOutput(
        "log",
        `[saveChangesNode] confirmed=true, changesToSave.length=${changesToSave.length}`
      );

      updateOutput(
        "log",
        `✅ User confirmed. Saving ${changesToSave.length} change(s)...`
      );

      for (const change of changesToSave) {
        updateOutput("log", `[saveChanges] Writing to: ${change.absPath}`);
        updateOutput(
          "log",
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

  const finalState = (await app.invoke(
    {
      query,
      repoName,
      repoPath,
      status: "started",
      pendingChanges: [],
      userConfirmed: false,
      llmContext: { thinkerPromptSize: 0, coderPromptSize: 0 },
    },
    { signal }
  )) as any;

  return {
    diffs: finalState.diffs,
    userConfirmed: finalState.userConfirmed,
    pendingChanges: finalState.pendingChanges || [],
  };
}
