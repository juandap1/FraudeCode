import type { Command } from "@/types/CommandDefinition";
import AgentCognition from "@/utils/agentCognition";
import useFraudeStore from "@/store/useFraudeStore";

const forgetCommand: Command = {
  name: "forget",
  description: "Reset the knowledge graph (clears all memories and embeddings)",
  usage: "/forget",
  action: async () => {
    const { updateOutput } = useFraudeStore.getState();
    try {
      updateOutput("log", "Resetting knowledge graph...");

      const cognition = AgentCognition.getInstance();
      await cognition.reset();

      updateOutput(
        "done",
        "Knowledge graph has been successfully reset. All memories contain data for the current session only.",
      );
    } catch (error) {
      updateOutput("error", `Error resetting knowledge graph: ${error}`);
    }
  },
};

export default forgetCommand;
