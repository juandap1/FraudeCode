import { tool } from "langchain";
import { z } from "zod";
import { mkdir } from "fs/promises";

const createTestScript = tool(
  async ({ testName, expectedOutput, description }) => {
    const testContent = `// Auto-generated test for: ${testName}
// ${description}

const EXPECTED_OUTPUT = ${JSON.stringify(expectedOutput)};

export async function runTest(): Promise<{ passed: boolean; actual: string; expected: string; message: string }> {
  const proc = Bun.spawn(["cargo", "run"], {
    cwd: "./learning",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  
  const actual = stdout.trim();
  const passed = exitCode === 0 && actual === EXPECTED_OUTPUT;
  
  return {
    passed,
    actual,
    expected: EXPECTED_OUTPUT,
    message: passed 
      ? "✓ Test passed!" 
      : exitCode !== 0 
        ? \`✗ Compilation error: \${stderr}\`
        : \`✗ Output mismatch. Expected: "\${EXPECTED_OUTPUT}", Got: "\${actual}"\`,
  };
}
`;
    await mkdir("./learning/.fraudecode/tests", { recursive: true });
    await Bun.write(`./learning/.fraudecode/tests/${testName}.ts`, testContent);
    return `Test script created: .fraudecode/tests/${testName}.ts`;
  },
  {
    name: "createTestScript",
    description:
      "Create a test script with expected output assertions. Use when SETTING UP a lesson to define verification criteria.",
    schema: z.object({
      testName: z
        .string()
        .describe("Test file name (e.g., 'hello_world_test')"),
      expectedOutput: z.string().describe("Exact expected stdout output"),
      description: z.string().describe("What this test verifies"),
    }),
  }
);

export default createTestScript;
