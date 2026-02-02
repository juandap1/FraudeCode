import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import DESCRIPTION from "./descriptions/bash.txt" with { type: "text" };

const { updateOutput } = useFraudeStore.getState();

const bashTool = tool({
  description: DESCRIPTION,
  strict: true,
  inputSchema: z.object({
    command: z.string().describe("The command to execute"),
    timeout: z
      .number()
      .describe("Optional timeout in milliseconds")
      .default(120000),
    workdir: z
      .string()
      .describe(
        `The working directory to run the command in. Defaults to project root ${process.cwd()}. Use this instead of 'cd' commands.`,
      )
      .optional(),
    description: z
      .string()
      .describe(
        "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
      ),
  }),
  execute: async ({
    command,
    timeout,
    workdir,
    description,
  }: {
    command: string;
    timeout: number;
    workdir?: string;
    description: string;
  }) => {
    const forbidden = ["rm -rf /", ":(){:|:&};:"];
    if (forbidden.some((bad) => command.includes(bad))) {
      throw new Error("Command blocked by safety policy");
    }

    try {
      updateOutput(
        "toolCall",
        JSON.stringify({
          action: "Executing Bash",
          details: command,
          result: "",
        }),
        { dontOverride: true },
      );

      const proc = Bun.spawn(["sh", "-c", command], {
        cwd: workdir || process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });

      const timeoutSignal = AbortSignal.timeout(timeout);

      const outputPromise = new Response(proc.stdout).text();
      const errorPromise = new Response(proc.stderr).text();
      if (timeoutSignal.aborted) {
        proc.kill();
        throw new Error("Command timed out");
      }

      const [stdout, stderr] = await Promise.all([outputPromise, errorPromise]);
      const exitCode = await proc.exited;

      updateOutput(
        "toolCall",
        JSON.stringify({
          action: "Bash",
          details: command,
          result: stdout.trim(),
        }),
      );
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: exitCode,
        cwd: workdir || process.cwd(),
      };
    } catch (err: any) {
      throw new Error(`Execution failed: ${err.message}`);
    }
  },
});

export default bashTool;
