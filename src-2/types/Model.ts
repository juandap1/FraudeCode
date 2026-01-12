import { z } from "zod";

export const ModelSchema = z.object({
  type: z.string().default("ollama"),
  name: z.string(),
  modified_at: z.string(),
  size: z.number().optional(),
  digest: z.string(),
  capabilities: z.array(z.string()).optional(),
  usage: z.number().default(0),
  details: z.object({
    format: z.string().optional(),
    family: z.string().optional(),
    families: z.array(z.string()).optional(),
    parameter_size: z.string().optional(),
    quantization_level: z.string().optional(),
    context_length: z.number().optional(),
  }),
});

export type Model = z.infer<typeof ModelSchema>;
