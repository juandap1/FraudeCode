import useSettingsStore from "@/store/useSettingsStore";
import Agent from "../agent";
import askPrompt from "../prompts/AskPrompt.txt" with { type: "text" };
import grepTool from "../tools/grepTool";
import globTool from "../tools/globTool";
import readTool from "../tools/readTool";
import bashTool from "../tools/bashTool";
let _askAgent: Agent | null = null;

/**
 * Get the ask agent instance.
 * Ask Agent is designed to answer questions about the codebase without changing anything
 */
export function getAskAgent(): Agent {
  const currentModel = useSettingsStore.getState().primaryModel;

  if (!_askAgent) {
    _askAgent = new Agent({
      model: currentModel,
      systemPrompt: askPrompt,
      tools: {
        grepTool,
        globTool,
        readTool,
        bashTool,
      },
      temperature: 0.7,
      maxSteps: 20,
      reasoningEffort: "high",
    });
  } else if (_askAgent.getModel() !== currentModel) {
    _askAgent.setModel(currentModel);
  }
  return _askAgent;
}

export default getAskAgent;
