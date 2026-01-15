import { UpdateSettings } from "@/config/settings";
import type { Model } from "@/types/Model";

import useSettingsStore from "@/store/useSettingsStore";
import useFraudeStore from "@/store/useFraudeStore";
import GroqClient from "@/services/groq";

const { updateOutput } = useFraudeStore.getState();

export const groqCommandHandler = async (command: string[]) => {
  try {
    const base = command.shift();
    switch (base) {
      case "add":
        const model = command.shift();
        if (!model) {
          updateOutput("error", "No model specified (Groq)");
          return;
        }
        await addGroqModel(model);
        break;
      case "auth":
        const apiKey = command.shift();
        if (!apiKey) {
          updateOutput("error", "No API key specified (Groq)");
          return;
        }
        await groqAuth(apiKey);
        break;
      default:
        updateOutput("error", "Unknown command (Groq)");
        break;
    }
  } catch (err) {
    updateOutput("error", `${err} (Groq)`);
  }
};

export const addGroqModel = async (model: string) => {
  const modelData: any = await GroqClient.getModelData(model);

  if (!modelData) {
    throw new Error(`No data found for Groq model ${model}`);
  }

  const newModel: Model = {
    type: "groq",
    name: model,
    modified_at: new Date(modelData.created * 1000).toISOString(),
    digest: modelData.id,
    capabilities: [],
    usage: 0,
    details: {
      context_length: modelData.context_window,
    },
  };

  const savedModels = useSettingsStore.getState().models || [];

  const existingIndex = savedModels.findIndex(
    (m) => m.name === newModel.name && m.type === "groq"
  );

  if (existingIndex >= 0) {
    savedModels[existingIndex] = newModel;
  } else {
    savedModels.push(newModel);
  }
  await UpdateSettings({ models: savedModels });
  updateOutput("log", "Groq model added: " + model);
};

export const groqAuth = async (apiKey: string) => {
  await UpdateSettings({ groq_api_key: apiKey });
  updateOutput("log", "Groq API key set");
};
