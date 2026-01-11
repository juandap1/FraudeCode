import { tool } from "langchain";
import { z } from "zod";

const getCurrentLesson = tool(
  async () => {
    const file = Bun.file("./learning/.fraudecode/learning.json");
    if (!(await file.exists())) return "No learning context found.";
    const data = await file.json();

    if (!data.currentLesson) {
      return "No active lesson. Generate a lesson first.";
    }

    return JSON.stringify(data.currentLesson);
  },
  {
    name: "getCurrentLesson",
    description:
      "Get the current active lesson context. Use this before verifying user code to know which test to run.",
    schema: z.object({}),
  }
);

export default getCurrentLesson;
