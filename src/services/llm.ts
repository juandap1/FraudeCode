import { ChatOllama } from "@langchain/ollama";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const THINKER_MODEL = process.env.THINKER_MODEL || "qwen3:8b";
const GENERAL_MODEL = process.env.CODER_MODEL || "llama3.1:latest";

export const thinkerModel = new ChatOllama({
  model: THINKER_MODEL,
  baseUrl: OLLAMA_URL,
  temperature: 0,
});

export const generalModel = new ChatOllama({
  model: GENERAL_MODEL,
  baseUrl: OLLAMA_URL,
  temperature: 0,
});

export const OLLAMA_BASE_URL = OLLAMA_URL;
