import { Settings, UpdateSettings, type Model } from "../utils/Settings";

import { useFraudeStore } from "../store/useFraudeStore";

const { setError, updateOutput } = useFraudeStore.getState();

export const groqCommandHandler = async (command: string[]) => {
  try {
    const base = command.shift();
    switch (base) {
      case "add":
        const model = command.shift();
        if (!model) {
          setError("No model specified (Groq)");
          return;
        }
        await addGroqModel(model);
        break;
      case "auth":
        const apiKey = command.shift();
        if (!apiKey) {
          setError("No API key specified (Groq)");
          return;
        }
        await groqAuth(apiKey);
        break;
      default:
        setError("Unknown command (Groq)");
        break;
    }
  } catch (err) {
    setError(`${err} (Groq)`);
  }
};

export const addGroqModel = async (model: string) => {
  const url = `https://api.groq.com/openai/v1/models/${model}`;
  const options = {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  };
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Failed to fetch Groq model ${model}: ${response.status}`);
  }

  const modelData: any = await response.json();

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

  const settings = Settings.getInstance();
  const savedModels = settings.get("models") || [];

  const existingIndex = savedModels.findIndex(
    (m) => m.name === newModel.name && m.type === "groq"
  );

  if (existingIndex >= 0) {
    savedModels[existingIndex] = newModel;
  } else {
    savedModels.push(newModel);
  }
  await UpdateSettings("models", savedModels);
  updateOutput("log", "Groq model added: " + model);
};

export const groqAuth = async (apiKey: string) => {
  await UpdateSettings("groq_api_key", apiKey);
  updateOutput("log", "Groq API key set");
};
