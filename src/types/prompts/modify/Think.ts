// ModificationThinkPrompt.ts
// v1
const ModificationThinkPrompt = (
  structuralContext: string,
  codeContext: string,
  query: string
) => `
You are an expert software engineer. Your task is to plan how to modify the code in the project based on the user's request.
Context:
Structural Context: ${structuralContext}
File Contents: ${codeContext}

User Request: "${query}"

Instructions:
1. Analyze which files need to be changed.
2. Formulate a step-by-step plan for the modifications.
3. Be precise about what logic needs to be updated.
4. Make the minimum number of changes possible.

Output your plan as a detailed technical specification. Begin immediately.
`;

export default ModificationThinkPrompt;
