import useSettingsStore from "@/store/useSettingsStore";
import Agent from "../agent";
import type { Fact } from "@/utils/agentCognition";
import useFraudeStore from "@/store/useFraudeStore";
import log from "@/utils/logger";

let _extractionAgent: Agent | null = null;

const EXTRACTION_PROMPT = `You are a knowledge extraction agent. Analyze the conversation and extract key learnings.

Output a JSON array of facts with this structure:
[
  {
    "type": "decision" | "fact" | "concept" | "reference",
    "content": "clear, concise description",
    "confidence": 0.0-1.0,
    "file": "optional/path/to/file.ts",
    "symbol": "optionalFunctionOrClassName"
  }
]

Rules:
- Extract ONLY explicitly stated or clearly implied information
- "decision": architectural choices, library selections, design patterns
- "fact": learned information about the codebase structure
- "concept": domain knowledge or technical concepts explained
- "reference": specific file/function relationships mentioned
- Assign lower confidence (0.5-0.7) to inferred facts
- Maximum 5 facts per extraction
- Skip trivial or obvious information

Respond with ONLY the JSON array, no other text.`;

/**
 * Get the extraction agent instance.
 * Used to extract facts from conversation content using LLM.
 */
export function getExtractionAgent(): Agent {
  const store = useSettingsStore.getState();
  const currentModel = store.secondaryModel || store.primaryModel;

  if (!_extractionAgent) {
    _extractionAgent = new Agent({
      model: currentModel,
      systemPrompt: EXTRACTION_PROMPT,
      tools: {},
      temperature: 0.1,
      maxSteps: 1,
      useIsolatedContext: true,
    });
  } else if (_extractionAgent.getModel() !== currentModel) {
    _extractionAgent.setModel(currentModel);
  }
  return _extractionAgent;
}

interface ExtractedFact {
  type: string;
  content: string;
  confidence: number;
  file?: string;
  symbol?: string;
}

/**
 * Extract facts from conversation content using LLM.
 * Returns parsed facts ready to be stored in AgentCognition.
 */
export async function extractFacts(
  content: string,
  sessionId: string,
): Promise<Omit<Fact, "id" | "timestamp">[]> {
  const agent = getExtractionAgent();
  const { updateOutput } = useFraudeStore.getState();
  log("Extracting facts from conversation:", content);
  try {
    const response = await agent.chat(
      `Extract facts from this conversation:\n\n${content.slice(0, 4000)}`,
    );

    let jsonStr = response.text;
    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let parsed: ExtractedFact[];
    try {
      parsed = JSON.parse(jsonStr) as ExtractedFact[];
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (f) =>
          f.type &&
          f.content &&
          f.content.length > 10 &&
          f.content.length < 300,
      )
      .map((f) => ({
        type: f.type as Fact["type"],
        content: f.content,
        data:
          f.file || f.symbol ? { file: f.file, symbol: f.symbol } : undefined,
        sessionId,
        confidence: f.confidence || 0.7,
      }));
  } catch (e) {
    updateOutput("error", "Extraction error: " + e);
    return [];
  }
}

export default getExtractionAgent;
