const generateIterationPrompt = (
  originalQuery: string,
  codeContext: string,
  currentPlan: string,
  feedback: string
) => `
You are an expert software engineer. Your task is to plan how to modify the BASE PLAN based on the user's change request.

<User Request>
${originalQuery}
</User Request>

<CHANGE_REQUEST>
${feedback}
</CHANGE_REQUEST>

<TARGET_CODE>
${codeContext}
</TARGET_CODE>

<BASE_PLAN>
${currentPlan}
</BASE_PLAN>

### Constraints:
- Output ONLY the implementation plan. No conversational filler.
- Each file must be handled in its own section. Never repeat a FILE header.
- **ATOMIC STEPS**: Each task must be a complete, self-contained functional change. Do not split "defining a function" and "writing the body" into separate tasks.
- Include instructions on where to place the code.
- **SNIPPETS**: Include the exact code block or logic within the task description.

### Output Format:
FILE: [path/to/file]
- [ ] TASK: [Complete functional change description + code snippet]
---
FILE: [next/file/path]
...

IMPORTANT: If a file is not modified, DO NOT include it in the output.

INSTRUCTIONS START HERE:
`;

export default generateIterationPrompt;
