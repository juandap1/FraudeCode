import { tool } from "langchain";
import { z } from "zod";

const setCurrentLesson = tool(
  async ({ title, lessonFile, testName, sourceFiles }) => {
    const file = Bun.file("./learning/.fraudecode/learning.json");
    const data = await file.json();

    data.currentLesson = {
      title,
      lessonFile,
      testName,
      sourceFiles,
      startedAt: new Date().toISOString(),
    };

    await Bun.write(file.name!, JSON.stringify(data, null, 2));
    return `Current lesson set to: ${title}`;
  },
  {
    name: "setCurrentLesson",
    description:
      "Set the current active lesson after creating it. Call this after generating a lesson to track context.",
    schema: z.object({
      title: z.string().describe("Title of the lesson"),
      lessonFile: z
        .string()
        .describe("Lesson markdown file name (e.g., 'LESSON_Hello_World.md')"),
      testName: z
        .string()
        .describe(
          "Test script name for verification (e.g., 'hello_world_test')"
        ),
      sourceFiles: z
        .array(z.string())
        .describe(
          "Source files the user needs to modify (e.g., ['src/main.rs'])"
        ),
    }),
  }
);

export default setCurrentLesson;
