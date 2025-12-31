const generateIterationPrompt = (
  originalQuery: string,
  codeContext: string,
  currentPlan: string,
  feedback: string
) => `
You are an expert software engineer. Your task is to correct the base plan based on the user's change request.

### REFERENCE DATA
- **Original Goal:** ${originalQuery}
- **Code Context:** \`\`\`
${codeContext}
\`\`\`

### BASE PLAN
${currentPlan}

### CHANGE REQUEST
${feedback}

### INSTRUCTIONS FOR OUTPUT
1. Analyze original goal and base plan
2. Analyze change request
3. Modify base plan to address change request, while maintaining original goal
4. Make the minimum number of changes possible

Output your plan as a detailed technical specification. Begin immediately.
`;

export default generateIterationPrompt;
