import useSettingsStore from "@/store/useSettingsStore";
import Agent from "../agent";
import planTool from "../tools/planTool";
import todoTool from "../tools/todoTool";
import researchSubAgentTool from "../subagents/researchSubAgent";
import managerPrompt from "../prompts/PlannerPrompt.txt" with { type: "text" };

let _managerAgent: Agent | null = null;

/**
 * Get the manager agent instance.
 * Uses lazy initialization to ensure settings are loaded before reading primaryModel.
 */
export function getManagerAgent(): Agent {
  if (!_managerAgent) {
    _managerAgent = new Agent({
      model: useSettingsStore.getState().primaryModel,
      systemPrompt: managerPrompt,
      tools: {
        planTool,
        todoTool,
        researchSubAgentTool,
      },
      temperature: 0.7,
      maxSteps: 20,
      reasoningEffort: "high",
    });
  }
  return _managerAgent;
}

export default getManagerAgent;
