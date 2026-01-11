import {
  tool,
  createAgent,
  summarizationMiddleware,
  ReactAgent,
} from "langchain";
import { z } from "zod";
import { mkdir } from "fs/promises";
import { llm } from "../llm";

const allModels = [
  "xiaomi/mimo-v2-flash:free", // 0
  "openai/gpt-oss-120b", // 1
  "moonshotai/kimi-k2-instruct-0905", // 2
  "llama3.1:latest", // 3
  "mistral:latest", // 4
  "phi4:latest", // 5
  "qwen2.5-coder:7b", // 6
  "qwen3:8b", // 7
];

const systemBasePrompt = `
You are a programming instructor. Your job is to design lessons for a student to learn the programming language Rust. Use the available tools to complete the user's request.

AVAILABLE TOOLS:
- **writeFile**: Write a file to the learning directory.
- **viewLessonHistory**: View the lesson history. Use this to understand what the student has already learned and determine what lesson to create next.
- **createTestScript**: Create test assertions when setting up a lesson to define pass/fail criteria.
- **runUserCode**: Execute user code and run tests when evaluating student submissions.
- **readUserCode**: Read user code files to provide feedback.
- **markLessonComplete**: Record lesson completion with concepts, performance, and areas for improvement.
- **setCurrentLesson**: Set the current active lesson after creating it.
- **getCurrentLesson**: Get current lesson context for verification.
`;

const introPrompt = `
Create a markdown file called INTRODUCTION.md in the learning directory.

Start the file introducing the language and common uses, as well as any notable features that differentiate it.

Next, provide detailed instructions on what the user needs to download to get started with the language. Keep this as simple as possible. 
You can provide optional quality of life suggestions, but keep everything short and simple.
End with instructions on how to init a rust project in the learning directory.

Create a .gitignore file in the learning directory, to ignore files typically ignored for a rust project.
`;

const generateLessonPrompt = `
Your job is to design and setup a lesson for the student.

Examine the lesson history to understand what the student has already learned and determine what lesson to create next.

If the student has not started learning, create a Hello World lesson to introduce them to the language.
  
Your Lesson should have the following:
<LESSON>
- A title for the lesson
- Topics to be covered in the lesson
- Provide instruction on what the concepts are and how they can be used. i.e. print in python is used to print text to the console
- Provide an example or two for each concept.
- A task for the student to complete to demonstrate their understanding of the lesson.
- The task should have a testable, verifiable output.
- Provide instructions on how to run the code for the task (assume the user has necessary packages installed)
- Keep the lesson short and simple, but explain everything clearly
- Create a file called LESSON_{title}.md in the learning directory
</LESSON>

<SETUP>
- Create any script files in the "src" folder of the learning directory needed for the student to complete the task.
- Reference the lesson file name in a comment at the top of each created script file.
- Only add the skeleton for the function that the user should modify.
- Make sure not to complete the task for the user.
- Add comments to the skeleton to explain what the function should do.
</SETUP>

<FINALIZE>
- Use createTestScript to create a test with the exact expected output for verification.
- Use setCurrentLesson to set the current lesson context with the lesson title, file name, test name, and source files.
</FINALIZE>
`;

const verifyUserAnswerPrompt = `
Your job is to verify the user's answer to the current lesson task.

1. Use getCurrentLesson to get the current lesson context
2. Run the user's code using runUserCode with the lesson's testName
3. If passed:
   - Congratulate the user on completing the lesson
   - Use readUserCode to review their solution
   - Call markLessonComplete with concepts, performance summary, and any areas for improvement
4. If failed:
   - Use readUserCode to examine their code
   - Provide specific, helpful feedback explaining what went wrong
   - Encourage them to try again
`;

async function initLearning() {
  await mkdir("./learning", { recursive: true });
  await mkdir("./learning/.fraudecode", { recursive: true });
  Bun.write(
    "./learning/.fraudecode/learning.json",
    JSON.stringify({ lang: "rust", lessons: [], currentLesson: null })
  );
}
const useAgent = async (agent: ReactAgent, query: string) => {
  const startTime = Date.now();
  const response = await agent.invoke({
    messages: [
      { role: "system", content: systemBasePrompt },
      { role: "user", content: query },
    ],
  });
  const endTime = Date.now();
  console.log(response);
  console.log(`Time taken: ${(endTime - startTime) / 1000}s`);
};

const learningRouter = async () => {
  const learningFile = Bun.file("./learning/.fraudecode/learning.json");
  if (!(await learningFile.exists())) await initLearning();
  let modelName = allModels[1];
  if (!modelName) return;
  const model = llm.getClient(modelName);
  const agent = createAgent({
    model,
    tools: [],
    // middleware: [
    //   summarizationMiddleware({
    //     model,
    //     trigger: { fraction: 0.5 },
    //     keep: { fraction: 0.3 },
    //   }),
    // ],
  });
};

export default learningRouter;
