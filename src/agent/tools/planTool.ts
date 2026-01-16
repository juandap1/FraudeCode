import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import DESCRIPTION from "./descriptions/plan.txt";

const { updateOutput } = useFraudeStore.getState();

const planTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({}),
  execute: async () => {},
});

export default planTool;
