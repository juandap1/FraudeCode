import useSettingsStore from "../store/useSettingsStore";

const getSettings = () => useSettingsStore.getState();

class OpenRouterClient {
  async getModelData(model: string) {
    const url = `https://openrouter.ai/api/v1/models/${model}/endpoints`;
    const options = {
      method: "GET",
      headers: { Authorization: `Bearer ${getSettings().openrouter_api_key}` },
    };
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenRouter model ${model}: ${response.status}`
      );
    }
    const data: any = await response.json();
    return data;
  }
}

export default new OpenRouterClient();
