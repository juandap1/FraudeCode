import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// const ModificationCodeChangesPrompt = (
//   codeContext: string,
//   thinkingProcess: string,
//   query: string
// ) => `
// You are a code modification engine. Your job is to provide the ADD OR REMOVE patch needed to complete the provided task

// ONLY DO WHAT THE TASK ASKS YOU TO DO. DO NOT ADD ANYTHING ELSE.

// ONLY OUTPUT THE ADD OR REMOVE PATCH. DO NOT EXPLAIN OR COMMENT ON THE PATCH.

// <TASK>
// ${thinkingProcess}
// </TASK>

// <TARGET_CODE>
// ${codeContext}
// </TARGET_CODE>

// PATCH FORMAT (EXACT):

// FILE: <path/to/file>
// AT LINE <line_number>:
// <PATCH_TYPE>:
// \`\`\`<language>
// <exact code to add or remove>
// \`\`\`

// OUTPUT PATCH HERE:
// `;

const ModificationCodeChangesPrompt = (
  codeContext: string,
  patchTask: string
) => [
  new SystemMessage(
    `You are a code modification engine. Your job is to provide the patches needed to complete the provided task.

You must treat the existing code as correct and intentional. Do not refactor, reorganize, demonstrate usage, or improve code unless the task explicitly calls for it.
    
ONLY PROVIDE PATCHES REQUIRED TO COMPLETE THE TASK. DO NOT ADD ANYTHING ELSE.

<RULES>
1. To INSERT code:
   - "RANGE" should be the line number where you want to insert.
   - "ORIGINAL" block MUST be empty.
   - "CODE" block contains the new code.
2. To DELETE code:
   - "RANGE" covers the lines to delete.
   - "ORIGINAL" block must contain the exact lines you are deleting.
   - "CODE" block MUST be empty.
3. To MODIFY code:
   - "RANGE" covers the lines to change.
   - "ORIGINAL" block must contain the exact lines you are replacing.
   - "CODE" block contains the new version.
</RULES>
    
<TARGET_CODE>
${codeContext}
</TARGET_CODE>

OUTPUT FORMAT (STRICT):
FILE: <path/to/file>
TYPE: <INSERT OR DELETE OR MODIFY>
RANGE: <start_line> TO <end_line>
ORIGINAL (MUST BE EMPTY IF INSERTING):
\`\`\`<language>
<exact text of the lines being replaced>
\`\`\`
CODE:
\`\`\`<language>
<new_code>
\`\`\`

ONLY PROVIDE THE PATCHES. DO NOT ADD EXPLANATIONS.
DOUBLE CHECK OUTPUT FOLLOWS ALL THE RULES. BREAKING A RULE WILL RESULT IN A FAILURE.`
  ),
  new HumanMessage(`Task: ${patchTask}\n\nStart listing changes:`),
];

export default ModificationCodeChangesPrompt;
