import type { Command } from "@/types/CommandDefinition";
import useFraudeStore from "@/store/useFraudeStore";
import AgentCognition from "@/utils/agentCognition";

const rememberCommand: Command = {
  name: "remember",
  description: "Store a fact or decision in project knowledge",
  usage: "/remember <content>",
  action: async (args: string[]) => {
    const { updateOutput } = useFraudeStore.getState();

    if (args.length < 1) {
      updateOutput("log", "Usage: /remember <content>");
      return;
    }

    const type = "fact";

    const content = args.join(" ");
    if (content.length < 5) {
      updateOutput(
        "error",
        "Content too short. Provide a meaningful description.",
      );
      return;
    }

    try {
      const cognition = AgentCognition.getInstance();
      await cognition.init();

      const id = await cognition.addFact({
        type: type as "decision" | "fact" | "concept" | "reference",
        content,
        confidence: 1.0,
      });

      updateOutput(
        "log",
        `✓ Remembered [${type}]: "${content.slice(0, 50)}..."`,
      );
    } catch (e) {
      updateOutput("error", `Failed to store: ${e}`);
    }
  },
};

export default rememberCommand;
