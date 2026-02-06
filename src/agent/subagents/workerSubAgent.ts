import { Agent } from "@/agent";
import readTool from "../tools/readTool";
import grepTool from "../tools/grepTool";
import writeTool from "../tools/writeTool";
import editTool from "../tools/editTool";
import bashTool from "../tools/bashTool";
import todoTool from "../tools/todoTool";
import useSettingsStore from "@/store/useSettingsStore";
import WorkerPrompt from "../prompts/WorkerPrompt.txt" with { type: "text" };

let _workerSubAgent: Agent | null = null;

/**
 * Get the worker subagent instance.
 * Uses lazy initialization to ensure settings are loaded before reading primaryModel.
 */
export function getWorkerSubAgent(): Agent {
  const currentModel = useSettingsStore.getState().primaryModel;

  if (!_workerSubAgent) {
    _workerSubAgent = new Agent({
      model: currentModel,
      systemPrompt: WorkerPrompt,
      tools: {
        readTool,
        grepTool,
        writeTool,
        editTool,
        bashTool,
        todoTool,
      },
      temperature: 0.7,
      maxSteps: 10,
      useIsolatedContext: true,
    });
  } else if (_workerSubAgent.getModel() !== currentModel) {
    _workerSubAgent.setModel(currentModel);
  }
  return _workerSubAgent;
}

export default getWorkerSubAgent;
