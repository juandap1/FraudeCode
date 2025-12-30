import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import summarizeProject from "../actions/summarize_project";

export const createSummarizeProjectTool = () => {
  return new DynamicStructuredTool({
    name: "summarize_project",
    description:
      "Summarizes the current project structure and content. Use this tool when the user asks for a summary or overview of the project.",
    schema: z.object({
      query: z
        .string()
        .describe(
          "The query describing what to summarize (e.g., 'summarize project', 'overview of functions').Defaults to 'Overview of the project functions and classes' if not specified."
        ),
    }),
    func: async ({ query }) => {
      await summarizeProject();
      return "Summary generation initiated.";
    },
  });
};
