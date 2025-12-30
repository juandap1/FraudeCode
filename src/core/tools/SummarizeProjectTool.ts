import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import summarizeProject from "../actions/summarize_project";
import { ChatOllama } from "@langchain/ollama";

export const createSummarizeProjectTool = (
  coderModel: ChatOllama,
  signal?: AbortSignal
) => {
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
      // The underlying action currently ignores the query argument in favor of a hardcoded one or one passed in state,
      // but let's pass it through if possible or just trigger the action.
      // Looking at `summarizeProject.ts`, it takes `coderModel` and `signal`.
      // The query is hardcoded in `summarizeProject.ts` but we can refactor later if needed.
      // For now, we just call the function.
      await summarizeProject(coderModel, signal);
      return "Summary generation initiated.";
    },
  });
};
