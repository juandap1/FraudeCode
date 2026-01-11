import { tool } from "langchain";
import { z } from "zod";

const markLessonComplete = tool(
  async ({
    lessonTitle,
    conceptsCovered,
    userPerformance,
    areasForImprovement,
  }) => {
    const file = Bun.file("./learning/.fraudecode/learning.json");
    const data = await file.json();

    const lessonRecord = {
      title: lessonTitle,
      completedAt: new Date().toISOString(),
      conceptsCovered,
      userPerformance,
      areasForImprovement,
    };

    // Replace existing or add new lesson record
    const existingIdx = data.lessons.findIndex(
      (l: any) => l.title === lessonTitle
    );
    if (existingIdx >= 0) {
      data.lessons[existingIdx] = lessonRecord;
    } else {
      data.lessons.push(lessonRecord);
    }

    await Bun.write(file.name!, JSON.stringify(data, null, 2));
    return `Lesson "${lessonTitle}" recorded with performance data.`;
  },
  {
    name: "markLessonComplete",
    description:
      "Record lesson completion with detailed summary for personalized learning.",
    schema: z.object({
      lessonTitle: z.string().describe("Title of the completed lesson"),
      conceptsCovered: z
        .array(z.string())
        .describe("Key concepts the user practiced"),
      userPerformance: z
        .string()
        .describe(
          "Summary of how the user performed (e.g., 'Completed on first attempt')"
        ),
      areasForImprovement: z
        .array(z.string())
        .describe("Identified weaknesses or suggestions for improvement"),
    }),
  }
);

export default markLessonComplete;
