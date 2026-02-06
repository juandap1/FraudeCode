import useSettingsStore from "@/store/useSettingsStore";
import Agent from "../agent";
import log from "@/utils/logger";

let _relationAgent: Agent | null = null;

const RELATION_PROMPT = `You classify relationships between knowledge facts.

Given two facts, determine their relationship type. Output ONLY one of:
- DEPENDS_ON: First fact relies on or requires the second
- IMPLEMENTS: First fact is a concrete implementation of the second
- MODIFIES: First fact changes or affects the second
- USES: First fact utilizes or references the second
- RELATED_TO: General semantic relationship (default if unsure)

Output format: Just the relationship type, nothing else.`;

/**
 * Get the relation classification agent instance.
 */
export function getRelationAgent(): Agent {
  const store = useSettingsStore.getState();
  const currentModel = store.secondaryModel || store.primaryModel;

  if (!_relationAgent) {
    _relationAgent = new Agent({
      model: currentModel,
      systemPrompt: RELATION_PROMPT,
      tools: {},
      temperature: 0.1,
      maxSteps: 1,
      useIsolatedContext: true,
    });
  } else if (_relationAgent.getModel() !== currentModel) {
    _relationAgent.setModel(currentModel);
  }
  return _relationAgent;
}

export type RelationType =
  | "DEPENDS_ON"
  | "IMPLEMENTS"
  | "MODIFIES"
  | "USES"
  | "RELATED_TO";

/**
 * Classify the relationship between two facts using LLM.
 */
export async function classifyRelation(
  factA: string,
  factB: string,
): Promise<RelationType> {
  const agent = getRelationAgent();

  try {
    const response = await agent.chat(
      `Fact A: "${factA}"\nFact B: "${factB}"\n\nRelationship type:`,
    );

    const text = response.text.trim().toUpperCase();

    // Parse response to valid relation type
    if (text.includes("DEPENDS_ON")) return "DEPENDS_ON";
    if (text.includes("IMPLEMENTS")) return "IMPLEMENTS";
    if (text.includes("MODIFIES")) return "MODIFIES";
    if (text.includes("USES")) return "USES";

    return "RELATED_TO";
  } catch (e) {
    log("Relation classification failed: " + e);
    return "RELATED_TO";
  }
}

export default getRelationAgent;
