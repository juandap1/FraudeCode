import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage } from "@langchain/core/messages";
import Neo4jClient from "../neo4jcli";
import QdrantCli from "../qdrantcli";
import * as fs from "fs";
import * as path from "path";
import * as diff from "diff";

// Define the state of our graph
const AgentState = Annotation.Root({
  query: Annotation<string>(),
  repoPath: Annotation<string>(),
  repoName: Annotation<string>(),
  structuralContext: Annotation<string>(),
  codeContext: Annotation<string>(),
  thinkingProcess: Annotation<string>(),
  modifications: Annotation<string>(),
  diffs: Annotation<string>(),
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

  const analyzeNode = async (state: typeof AgentState.State) => {
    setStreamedText(() => "🔍 [ANALYSIS] Starting contextual search...\n");

    // 1. Semantic Search in Qdrant
    setStreamedText(
      (prev) => prev + "📡 Searching Qdrant vector database...\n"
    );
    const searchResults = await qdrant.hybridSearch(
      state.repoName,
      state.query
    );

    // 2. Structural Context from Neo4j
    const words = state.query.split(/\W+/);
    let structuralContext = "";
    for (const word of words) {
      if (word.length < 3) continue;
      setStreamedText(
        (prev) =>
          prev + `🧬 Inspecting structural relationships for "${word}"...\n`
      );
      const symContext = await neo4j.getContextBySymbol(word);
      if (symContext.length > 0) {
        structuralContext +=
          `\nSymbol info for "${word}":\n` +
          JSON.stringify(symContext, null, 2) +
          "\n";
      }
    }

    // 3. Gather File Contents
    const fileContents: Record<string, string> = {};
    if (searchResults) {
      for (const res of searchResults as any[]) {
        const filePath = res.payload.filePath;
        if (filePath && !fileContents[filePath]) {
          const absPath = path.join(state.repoPath, "..", filePath);
          if (fs.existsSync(absPath)) {
            setStreamedText((prev) => prev + `📄 Reading file: ${filePath}\n`);
            fileContents[filePath] = fs.readFileSync(absPath, "utf8");
          }
        }
      }
    }

    let codeContext = "";
    for (const [filePath, content] of Object.entries(fileContents)) {
      codeContext += `--- FILE: ${filePath} ---\n${content}\n\n`;
    }

    setStreamedText((prev) => prev + "\n✅ Context gathering complete.\n");

    return {
      structuralContext,
      codeContext,
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
              fileDiff += `      [${newLine
                .toString()
                .padStart(3)}] + ${line}\n`;
              newLine++;
            } else if (part.removed) {
              fileDiff += `[${oldLine
                .toString()
                .padStart(3)}]       - ${line}\n`;
              oldLine++;
            } else {
              fileDiff += `[${oldLine.toString().padStart(3)}][${newLine
                .toString()
                .padStart(3)}]   ${line}\n`;
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
    .addNode("analyze", analyzeNode)
    .addNode("think", thinkNode)
    .addNode("code", codeNode)
    .addNode("verify", verifyNode);

  workflow.addEdge(START, "analyze");
  workflow.addEdge("analyze", "think");
  workflow.addEdge("think", "code");
  workflow.addEdge("code", "verify");
  workflow.addEdge("verify", END);

  const app = workflow.compile();

  const finalState = await app.invoke({
    query,
    repoName,
    repoPath,
    status: "started",
  });

  return finalState.diffs;
}
