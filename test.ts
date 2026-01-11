import { Settings } from "./src/utils/Settings";
import { useSettingsStore } from "./src/store/settingsStore";
import { llm } from "./src/core/llm";
import { mkdir } from "fs/promises";
import {
  tool,
  createAgent,
  summarizationMiddleware,
  ReactAgent,
} from "langchain";
import { z } from "zod";

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

async function main() {
  await Settings.init();
  useSettingsStore.getState().syncWithSettings();
  const learningFile = Bun.file("./learning/.fraudecode/learning.json");
  if (!(await learningFile.exists())) await initLearning();
  let modelName = allModels[1];
  if (!modelName) return;
  const model = llm.getClient(modelName);
  const agent = createAgent({
    model,
    tools: [
      writeFile,
      viewLessonHistory,
      createTestScript,
      runUserCode,
      readUserCode,
      markLessonComplete,
      setCurrentLesson,
      getCurrentLesson,
    ],
    // middleware: [
    //   summarizationMiddleware({
    //     model,
    //     trigger: { fraction: 0.5 },
    //     keep: { fraction: 0.3 },
    //   }),
    // ],
  });
  // await useAgent(agent, introPrompt);
  // await useAgent(agent, generateLessonPrompt);
  await useAgent(agent, verifyUserAnswerPrompt);
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

// ==================== VERIFICATION TOOLS ====================

const readUserCode = tool(
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

// ==================== LESSON CONTEXT TOOLS ====================

main();
