const summarizePrompt = (
  repoName: string,
  structureData: string,
  codeContext: string
) => `
You are a senior software architect. Analyze the follow project structure and code snippets from the "${repoName}" project.
Then provide:
1. A brief overview of what the overall project can do.
2. A description of each file and its role in the project.
3. The overall project structure.

Project Structure:
${structureData}

Code Context:
${codeContext}

Full Response:
`;

export default summarizePrompt;
