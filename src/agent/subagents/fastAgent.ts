import useSettingsStore from "@/store/useSettingsStore";
import Agent from "../agent";
import researchSubAgentTool from "../subagents/researchSubAgent";
import fastAgentPrompt from "../prompts/FastPrompt.txt" with { type: "text" };
import writeTool from "../tools/writeTool";
import editTool from "../tools/editTool";
import readTool from "../tools/readTool";
import bashTool from "../tools/bashTool";
import grepTool from "../tools/grepTool";
import testRunnerTool from "../tools/testRunnerTool";
import testTool from "../tools/testTool";
let _fastAgent: Agent | null = null;

/**
 * Get the fast agent instance.
 * Use to complete a user request without any planning. Use for simple tasks.
 */
export function getFastAgent(): Agent {
  if (!_fastAgent) {
    _fastAgent = new Agent({
      model: useSettingsStore.getState().primaryModel,
      systemPrompt: fastAgentPrompt,
      tools: {
        researchSubAgentTool,
        readTool,
        grepTool,
        writeTool,
        editTool,
        bashTool,
        testTool,
        testRunnerTool,
      },
      temperature: 0.7,
      maxSteps: 20,
      reasoningEffort: "high",
    });
  }
  return _fastAgent;
}

export default getFastAgent;
