import type { Command } from "@/types/CommandDefinition";
import useFraudeStore from "@/store/useFraudeStore";
import AgentCognition from "@/utils/agentCognition";

const knowledgeCommand: Command = {
  name: "knowledge",
  description: "View or search stored project knowledge",
  usage: "/knowledge <query>",
  action: async (args: string[]) => {
    const { updateOutput } = useFraudeStore.getState();

    try {
      const cognition = AgentCognition.getInstance();
      await cognition.init();

      if (args.length === 0) {
        // Show summary of all knowledge
        const decisions = await cognition.findByType("decision");
        const facts = await cognition.findByType("fact");
        const concepts = await cognition.findByType("concept");
        const references = await cognition.findByType("reference");
        const summaries = await cognition.findByType("summary");

        const lines = [
          "📚 **Project Knowledge**",
          "",
          `**Decisions** (${decisions.length})`,
          ...decisions
            .slice(0, 5)
            .map((d) => `  • ${d.content.slice(0, 60)}...`),
          decisions.length > 5 ? `  ... and ${decisions.length - 5} more` : "",
          "",
          `**Facts** (${facts.length})`,
          ...facts.slice(0, 5).map((f) => `  • ${f.content.slice(0, 60)}...`),
          facts.length > 5 ? `  ... and ${facts.length - 5} more` : "",
          "",
          `**Concepts** (${concepts.length})`,
          ...concepts
            .slice(0, 3)
            .map((c) => `  • ${c.content.slice(0, 60)}...`),
          "",
          `**References** (${references.length})`,
          ...references
            .slice(0, 3)
            .map((r) => `  • ${r.content.slice(0, 60)}...`),
          "",
          `**Session Summaries** (${summaries.length})`,
          ...summaries
            .slice(0, 3)
            .map((s) => `  • ${s.content.slice(0, 80)}...`),
        ].filter((l) => l !== "");

        updateOutput("log", lines.join("\n"));
      } else {
        // Search knowledge
        const query = args.join(" ");
        const results = await cognition.retrieveRelevant(query, 10);

        if (results.length === 0) {
          updateOutput("log", `No knowledge found for: "${query}"`);
          return;
        }

        const lines = [
          `🔍 **Search Results for "${query}"**`,
          "",
          ...results.map(
            (r) =>
              `[${r.type}] ${r.content.slice(0, 80)}${r.content.length > 80 ? "..." : ""}`,
          ),
        ];

        updateOutput("log", lines.join("\n"));
      }
    } catch (e) {
      updateOutput("error", `Failed to retrieve knowledge: ${e}`);
    }
  },
};

export default knowledgeCommand;
