import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import AgentCognition from "@/utils/agentCognition";

const { updateOutput } = useFraudeStore.getState();

const DESCRIPTION = `Store important information for future sessions.

Use this tool to remember key facts, decisions, concepts, or file references that should persist across agent sessions. The agent will automatically validate and retrieve relevant knowledge in future sessions.

Types:
- fact: Learned information about the codebase (e.g., "API uses REST with JWT auth")
- decision: Architectural or implementation choices (e.g., "Using Zustand over Redux")
- concept: Domain knowledge (e.g., "User sessions expire after 24h")
- reference: File or function relationships (e.g., "auth.ts handles all authentication")

For references, include file paths to enable validation.`;

const rememberTool = tool({
  description: DESCRIPTION,
  strict: true,
  inputSchema: z.object({
    fact: z.string().describe("The information to remember"),
    type: z
      .enum(["fact", "decision", "concept", "reference"])
      .describe("Type of knowledge being stored"),
    file: z
      .string()
      .optional()
      .describe("Optional file path this knowledge relates to"),
    symbol: z
      .string()
      .optional()
      .describe("Optional function/class name this knowledge relates to"),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .default(0.9)
      .describe(
        "Confidence level (0-1). Default 0.9 for explicit user requests",
      ),
  }),
  execute: async ({
    fact,
    type,
    file,
    symbol,
    confidence,
  }: {
    fact: string;
    type: "fact" | "decision" | "concept" | "reference";
    file?: string;
    symbol?: string;
    confidence: number;
  }) => {
    const cognition = AgentCognition.getInstance();
    await cognition.init();

    // Build data object
    const data: Record<string, string> = {};
    if (file) data.file = file;
    if (symbol) data.symbol = symbol;

    const id = await cognition.addFact({
      type,
      content: fact,
      data: Object.keys(data).length > 0 ? data : undefined,
      confidence,
    });

    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Remember",
        details: fact,
        result: `Stored as ${type}`,
      }),
      { dontOverride: true },
    );

    return {
      success: true,
      id,
      message: `Remembered: "${fact}" as ${type}`,
    };
  },
});

export default rememberTool;
