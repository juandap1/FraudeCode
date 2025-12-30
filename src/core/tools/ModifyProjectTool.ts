import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import langgraphModify from "../actions/langgraph_modify";

export const createModifyProjectTool = (
  promptUserConfirmation: () => Promise<boolean>
) => {
  return new DynamicStructuredTool({
    name: "modify_project",
    description:
      "Modifies the project based on a user request. Use this tool when the user asks to creates files, delete files, edit code, fix bugs, or change functionality.",
    schema: z.object({
      request: z
        .string()
        .describe(
          "The detailed request from the user describing what to modify."
        ),
    }),
    func: async ({ request }) => {
      await langgraphModify(request, promptUserConfirmation);
      return "Modification process initiated.";
    },
  });
};
