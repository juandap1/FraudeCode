import { tool } from "langchain";
import { z } from "zod";

const writeFile = tool(
  ({ fileName, content }) => {
    Bun.write(`./learning/${fileName}`, content);
    return `File ${fileName} created successfully.`;
  },
  {
    name: "writeFile",
    description: "Write a file",
    schema: z.object({
      fileName: z
        .string()
        .describe("File name to write to in the learning directory"),
      content: z
        .string()
        .describe(
          "The full content of the file. content must be a properly escaped JSON string, especially newlines and quotes."
        ),
    }),
  }
);

export default writeFile;
