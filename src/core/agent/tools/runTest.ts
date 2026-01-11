import { tool } from "langchain";
import { z } from "zod";

const runTest = tool(
  async ({ testName }) => {
    // If a test name is provided and exists, run it for structured results
    if (testName) {
      const testPath = `./learning/.fraudecode/tests/${testName}.ts`;
      const testFile = Bun.file(testPath);

      if (await testFile.exists()) {
        const test = await import(testPath);
        const result = await test.runTest();
        return JSON.stringify(result);
      }
    }

    // Fallback: just run cargo and return output
    const proc = Bun.spawn(["cargo", "run"], {
      cwd: "./learning",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return JSON.stringify({
      passed: null, // No test to compare against
      actual: stdout.trim(),
      expected: null,
      message: exitCode === 0 ? "Code ran successfully" : `Error: ${stderr}`,
    });
  },
  {
    name: "runTest",
    description:
      "Run user's code and get output. If testName provided and test exists, runs assertions. Use when EVALUATING student submissions.",
    schema: z.object({
      testName: z
        .string()
        .optional()
        .describe(
          "Optional test name to run assertions (e.g., 'hello_world_test')"
        ),
    }),
  }
);

export default runTest;
