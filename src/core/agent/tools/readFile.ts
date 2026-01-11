import { tool } from "langchain";
import { z } from "zod";

export const viewLessonHistory = tool(
  async () => {
    const learningFile = Bun.file("./learning/.fraudecode/learning.json");
    if (!(await learningFile.exists())) return "No learning history found.";
    const data = await learningFile.json();
    return JSON.stringify(data.lessons);
  },
  {
    name: "viewLessonHistory",
    description:
      "View the lesson history. Used to understand what the student has already learned.",
    schema: z.object({}),
  }
);

export const readUserCode = tool(
  async ({ filePath }) => {
    const file = Bun.file(`./learning/${filePath}`);
    if (!(await file.exists())) return `File not found: ${filePath}`;
    return await file.text();
  },
  {
    name: "readUserCode",
    description: "Read a file from the learning directory to review user code.",
    schema: z.object({
      filePath: z.string().describe("Path relative to learning directory"),
    }),
  }
);
