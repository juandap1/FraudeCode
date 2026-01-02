import Neo4jClient from "../../services/neo4j";
import QdrantCli from "../../services/qdrant";
import * as fs from "fs";
import * as path from "path";
import * as diff from "diff";

export default async function modifyProject(
  query: string,
  neo4j: Neo4jClient,
  qdrant: QdrantCli,
  action: (payload: any) => Promise<string | undefined>,
  setStreamedText: (text: string) => void
) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

  // 1. Semantic Search in Qdrant
  setStreamedText("Searching Qdrant for semantic context...");
  const searchResults = await qdrant.hybridSearch(repoName, query);

  // 2. Structural Context from Neo4j
  setStreamedText("Searching Neo4j for structural context...");
  const words = query.split(/\W+/);
  let structuralContext = "";
  for (const word of words) {
    if (word.length < 3) continue;
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
        const absPath = path.join(repoPath, "..", filePath);
        if (fs.existsSync(absPath)) {
          fileContents[filePath] = fs.readFileSync(absPath, "utf8");
        }
      }
    }
  }

  let codeContext = "";
  for (const [filePath, content] of Object.entries(fileContents)) {
    codeContext += `--- FILE: ${filePath} ---\n${content}\n\n`;
  }

  // 4. Prompt Ollama for Changes
  const prompt = `
You are an expert software engineer. Your task is to modify the code in the project based on the user's request.
Use the provided context to understand the project structure and logic.

User Request: "${query}"

Structural Context:
${structuralContext}

File Contents:
${codeContext}

Instructions:
1. Identify which files need to be modified.
2. Provide the FULL content of each modified file.
3. Format your response as follows:
   FILE: <path/to/file>
   \`\`\`<language>
   <full file content>
   \`\`\`

Example:
FILE: sample/utils.py
\`\`\`python
# updated content
\`\`\`

Only output the file sections as specified above. Do not include any other text.
`;

  setStreamedText("Generating modifications with Ollama...");
  const modificationResponse = await action({
    messages: [{ role: "user", content: prompt }],
    stream: false,
  });

  if (!modificationResponse) {
    setStreamedText("Error: No response from Ollama.");
    return;
  }

  setStreamedText("Applying changes...");
  // 5. Apply Changes
  const fileBlocks = modificationResponse
    .split(/FILE: /)
    .filter((b: string) => b.trim().length > 0);

  let allDiffs = "";

  for (const block of fileBlocks) {
    const lines = block.split("\n");
    const filePath = lines[0]?.trim();
    const codeMatch = block.match(/```(?:\w+)?\n([\s\S]*?)```/);

    if (filePath && codeMatch) {
      const newContent = codeMatch[1] ?? "";
      const absPath = path.join(repoPath, "..", filePath);

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
            fileDiff += `      [${newLine.toString().padStart(3)}] + ${line}\n`;
            newLine++;
          } else if (part.removed) {
            fileDiff += `[${oldLine.toString().padStart(3)}]       - ${line}\n`;
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
      setStreamedText(allDiffs);
      console.log(`Updating ${absPath}...`);
      // fs.writeFileSync(absPath, newContent);
    } else {
      console.warn("Could not parse file block:", block.substring(0, 100));
    }
  }

  console.log("\nSummary of Changes:");
  console.log(allDiffs);

  console.log("Finished applying modifications.");
}
