// ModificationThinkPrompt.ts
// v1
const ModificationThinkPrompt = (codeContext: string, query: string) => `
You are an expert software engineer. Your task is to plan how to modify the code based on the user's request using the principle of Least Growth (minimal, impactful changes).

AVOID AFFECTING EXISTING FUNCTIONALITY AS MUCH AS POSSIBLE UNLESS NEEDED TO COMPLETE THE REQUEST.

<User Request>
${query}
</User Request>

<TARGET_CODE>
${codeContext}
</TARGET_CODE>

### Constraints:
- Output ONLY the implementation plan. No conversational filler.
- Each file must be handled in its own section. Never repeat a FILE header.
- **ATOMIC STEPS**: Each task must be a complete, self-contained functional change. Do not split "defining a function" and "writing the body" into separate tasks.
- **LOCATION LOGIC**: ALWAYS include instructions on where to place the code
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

export default ModificationThinkPrompt;
