import { ChatOllama } from "@langchain/ollama";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const THINKER_MODEL = process.env.THINKER_MODEL || "qwen3:8b";
const GENERAL_MODEL = process.env.GENERAL_MODEL || "llama3.1:latest";
const SCOUT_MODEL = process.env.SCOUT_MODEL || "qwen2.5:0.5b";

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

export const scoutModel = new ChatOllama({
  model: SCOUT_MODEL,
  baseUrl: OLLAMA_URL,
  temperature: 0,
});

export const OLLAMA_BASE_URL = OLLAMA_URL;
