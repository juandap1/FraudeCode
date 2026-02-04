import type { Command } from "@/types/CommandDefinition";
import useFraudeStore from "@/store/useFraudeStore";
import AgentCognition from "@/utils/agentCognition";
import type { KnowledgeViewData } from "@/components/output/KnowledgeView";

const action = async (args: string[]) => {
  const { updateOutput } = useFraudeStore.getState();

  try {
    const cognition = AgentCognition.getInstance();
    await cognition.init();

    if (args.length === 0) {
      // Show summary of all knowledge
      const [decisions, facts, concepts, references, summaries] =
        await Promise.all([
          cognition.findByType("decision"),
          cognition.findByType("fact"),
          cognition.findByType("concept"),
          cognition.findByType("reference"),
          cognition.findByType("summary"),
        ]);

      const total =
        decisions.length +
        facts.length +
        concepts.length +
        references.length +
        summaries.length;

      if (total === 0) {
        const data: KnowledgeViewData = { mode: "empty" };
        updateOutput("knowledge", JSON.stringify(data));
        return;
      }

      const data: KnowledgeViewData = {
        mode: "summary",
        data: {
          decisions: decisions.map((d) => ({
            content: d.content,
            type: d.type,
          })),
          facts: facts.map((f) => ({ content: f.content, type: f.type })),
          concepts: concepts.map((c) => ({
            content: c.content,
            type: c.type,
          })),
          references: references.map((r) => ({
            content: r.content,
            type: r.type,
          })),
          summaries: summaries.map((s) => ({
            content: s.content,
            type: s.type,
          })),
        },
      };

      updateOutput("knowledge", JSON.stringify(data));
    } else {
      // Search knowledge
      const query = args.join(" ");
      const results = await cognition.retrieveRelevant(query, 10);

      const data: KnowledgeViewData = {
        mode: "search",
        data: {
          query,
          results: results.map((r) => ({ content: r.content, type: r.type })),
        },
      };

      updateOutput("knowledge", JSON.stringify(data));
    }
  } catch (e) {
    updateOutput("error", `Failed to retrieve knowledge: ${e}`);
  }
};

const knowledgeCommand: Command = {
  name: "knowledge",
  description: "View or search stored project knowledge",
  usage: "/knowledge",
  action,
  subcommands: [
    {
      name: "search",
      description: "Search stored project knowledge",
      usage: "/knowledge search <query>",
      action,
    },
  ],
};

export default knowledgeCommand;
