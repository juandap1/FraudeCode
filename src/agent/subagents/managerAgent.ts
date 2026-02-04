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
  const currentModel = useSettingsStore.getState().primaryModel;

  if (!_managerAgent) {
    _managerAgent = new Agent({
      model: currentModel,
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
  } else if (_managerAgent.getModel() !== currentModel) {
    _managerAgent.setModel(currentModel);
  }
  return _managerAgent;
}

export default getManagerAgent;
