const ModificationCodeChangesPrompt = (
  codeContext: string,
  thinkingProcess: string,
  query: string
) => `
You are an expert software engineer. Your task is to implement ONLY the necessary modifications to the project.

User Request: "${query}"
Plan: ${thinkingProcess}
File Contents: ${codeContext}

Instructions:
1. Provide ONLY the targeted changes needed - do NOT rewrite entire files.
2. For each file, specify which lines to ADD and which to REMOVE.
3. Format your response exactly as follows:

FILE: <path/to/file>
AT LINE <line_number>:
REMOVE:
\`\`\`<language>
<lines to remove - exact content>
\`\`\`
ADD:
\`\`\`<language>
<lines to add - replacement content>
\`\`\`

Example for adding a new import and modifying a function:

FILE: sample/utils.py
AT LINE 1:
ADD:
\`\`\`python
import new_module
\`\`\`

AT LINE 15:
REMOVE:
\`\`\`python
def old_function():
    return "old"
\`\`\`
ADD:
\`\`\`python
def new_function():
    return "new"
\`\`\`

IMPORTANT:
- Only include lines that actually change
- Use ONE block per logical change (e.g., adding an entire function should be one block, not multiple AT LINE instructions)
- Include enough context in REMOVE to uniquely identify the location
- If only adding (no removal), specify the line number where the addition should start
- If only removing (no addition), omit the ADD block
`;

export default ModificationCodeChangesPrompt;
