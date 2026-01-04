import { HumanMessage, SystemMessage } from "@langchain/core/messages";
// const generateIterationPrompt = (
//   originalQuery: string,
//   codeContext: string,
//   currentPlan: string,
//   feedback: string
// ) => `
// You are an expert software engineer. Your task is to output a revised plan based on the BASE PLAN and the user's change request.

// <User Request>
// ${originalQuery}
// </User Request>

// <CHANGE_REQUEST>
// ${feedback}
// </CHANGE_REQUEST>

// <TARGET_CODE>
// ${codeContext}
// </TARGET_CODE>

// <BASE_PLAN>
// ${currentPlan}
// </BASE_PLAN>

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

const generateIterationPrompt = (
  originalQuery: string,
  codeContext: string,
  currentPlan: string,
  feedback: string
) => [
  new SystemMessage(`You are an expert software engineer. Your task is to output a revised plan based on the BASE PLAN and the user's change request.

<User Request>
${originalQuery}
</User Request>

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
- **LOCATION LOGIC**: ALWAYS include instructions on where to place the code

### Output Format:
FILE: [path/to/file]
- [ ] TASK: [Complete functional change description]
---
FILE: [next/file/path]
...

IMPORTANT: If a file is not modified, DO NOT include it in the output.`),
  new HumanMessage(
    `Revise the BASE PLAN based on the user's change request:\n\n${feedback}\n\nOUTPUT IMPLEMENTATION PLAN HERE:`
  ),
];

export default generateIterationPrompt;
