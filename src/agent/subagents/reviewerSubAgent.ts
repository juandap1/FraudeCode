import { Agent } from "@/agent";
import readTool from "../tools/readTool";
import grepTool from "../tools/grepTool";
import lspTool from "../tools/lspTool";
import useSettingsStore from "@/store/useSettingsStore";
import todoTool from "../tools/todoTool";
import testRunnerTool from "../tools/testRunnerTool";
import testTool from "../tools/testTool";
import ReviewerPrompt from "../prompts/ReviewerPrompt.txt" with { type: "text" };

let _reviewerSubAgent: Agent | null = null;

/**
 * Get the reviewer subagent instance.
 * Uses lazy initialization to ensure settings are loaded before reading secondaryModel.
 */
export function getReviewerSubAgent(): Agent {
  if (!_reviewerSubAgent) {
    _reviewerSubAgent = new Agent({
      model: useSettingsStore.getState().secondaryModel,
      systemPrompt: ReviewerPrompt,
      tools: {
        readTool,
        grepTool,
        lspTool,
        testTool,
        todoTool,
        testRunnerTool,
      },
      temperature: 0.7,
      maxSteps: 10,
      useIsolatedContext: true,
    });
  }
  return _reviewerSubAgent;
}

export default getReviewerSubAgent;
