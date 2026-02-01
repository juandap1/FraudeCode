import { z } from "zod";
import { ModelSchema } from "../types/Model";

export const SettingsSchema = z.object({
  lastOpened: z.iso.datetime().optional(),
  ollamaUrl: z.string().default("http://localhost:11434"),
  primaryModel: z.string().default("qwen3:8b|ollama"),
  secondaryModel: z.string().default("llama3.1:latest|ollama"),
  models: z.array(ModelSchema).default([]),
  history: z.array(z.string()).default([]),
  openrouter_api_key: z.string().optional(),
  groq_api_key: z.string().optional(),
  mistral_api_key: z.string().optional(),
  cerebras_api_key: z.string().optional(),
  google_api_key: z.string().optional(),
  pluginSettings: z.any().default({}),
});

export type Config = z.infer<typeof SettingsSchema>;
