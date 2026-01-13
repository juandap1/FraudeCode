import useSettingsStore from "../store/useSettingsStore";

const getSettings = () => useSettingsStore.getState();

class GroqClient {
  async getModelData(model: string) {
    const url = `https://api.groq.com/openai/v1/models/${model}`;
    const options = {
      method: "GET",
      headers: { Authorization: `Bearer ${getSettings().groq_api_key}` },
    };
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Groq model ${model}: ${response.status}`
      );
    }
    const data: any = await response.json();
    return data;
  }
}

export default new GroqClient();
