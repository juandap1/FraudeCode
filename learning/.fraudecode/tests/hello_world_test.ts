// Auto-generated test for: hello_world_test
// Verify that the program prints exactly "Hello, world!" followed by a newline.

const EXPECTED_OUTPUT = "Hello, world!";

export async function runTest(): Promise<{
  passed: boolean;
  actual: string;
  expected: string;
  message: string;
}> {
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
      ? `✗ Compilation error: ${stderr}`
      : `✗ Output mismatch. Expected: "${EXPECTED_OUTPUT}", Got: "${actual}"`,
  };
}
