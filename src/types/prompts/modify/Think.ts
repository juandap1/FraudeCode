import { HumanMessage, SystemMessage } from "@langchain/core/messages";
// ModificationThinkPrompt.ts
// v1
// const ModificationThinkPrompt = (codeContext: string, query: string) => `
// You are an expert software engineer. Your task is to plan how to modify the code based on the user's request using the principle of Least Growth (minimal, impactful changes).

// AVOID AFFECTING EXISTING FUNCTIONALITY AS MUCH AS POSSIBLE UNLESS NEEDED TO COMPLETE THE REQUEST.

// <User Request>
// ${query}
// </User Request>

// <TARGET_CODE>
// ${codeContext}
// </TARGET_CODE>

// ### Constraints:
// - Output ONLY the implementation plan. No conversational filler.
// - Each file must be handled in its own section. Never repeat a FILE header.
// - **ATOMIC STEPS**: Each task must be a complete, self-contained functional change. Do not split "defining a function" and "writing the body" into separate tasks.
// - **LOCATION LOGIC**: ALWAYS include instructions on where to place the code

// ### Output Format:
// FILE: [path/to/file]
// - [ ] TASK: [Complete functional change description]
// ---
// FILE: [next/file/path]
// ...

// IMPORTANT: If a file is not modified, DO NOT include it in the output.

// INSTRUCTIONS START HERE:
// `;

const ModificationThinkPrompt = (codeContext: string, query: string) => [
  new SystemMessage(`You are a product manager tasked with generating a Task List. Each task should describe in detail a functional change in a clear and concise manner.
OUTPUT ONLY THE PLAN.

<HARD RULES>
1. ADD-FIRST PRIORITY (CRITICAL)
- Prefer ADDING over REMOVING.
- Do NOT remove existing functionality unless required to satisfy the request.
- If the request can be fulfilled by only adding, do not include removals.

2. LOCATION REQUIRED
- Every task must clearly state where the patch occurs
  (e.g., inside a function, after another function, before a constant or class).
</HARD RULES>

<TARGET_CODE>
${codeContext}
</TARGET_CODE>

<OUTPUT FORMAT>
FILE: path/to/file
- [ ] TASK: ...
---
(One FILE section per file. Do not repeat FILE headers. Only include files that require changes.)
</OUTPUT FORMAT>
`),
  new HumanMessage(
    `Generate a task list for the following user request:\n\n${query}\n\nOUTPUT TASKS HERE:`
  ),
];

export default ModificationThinkPrompt;
