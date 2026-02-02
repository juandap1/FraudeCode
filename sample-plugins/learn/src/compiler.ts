import { spawn, type Subprocess } from "bun";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type SupportedLanguage = "rust" | "javascript" | "typescript" | "python";

export class Compiler {
  private tempDir: string;
  private language: SupportedLanguage;
  private tool: string;
  private args: string[];
  private timeout: number;
  private inputs: string;

  constructor(
    language: string,
    private code: string,
    private options: {
      tool?: string;
      args?: string[];
      timeout?: number;
      inputs?: string;
    } = {},
  ) {
    this.tempDir = join(tmpdir(), `compile-${crypto.randomUUID()}`);
    this.language = language.toLowerCase() as SupportedLanguage;
    this.tool = options.tool || "";
    this.args = options.args || [];
    this.timeout = options.timeout || 10000;
    this.inputs = options.inputs || "";
  }

  async execute(): Promise<ExecutionResult> {
    switch (this.language) {
      case "javascript":
      case "typescript":
        return this.executeJsTs();
      case "python":
        return this.executePython();
      case "rust":
        return this.executeRust();
      default:
        return {
          stdout: "",
          stderr: `Unsupported language: ${this.language}`,
          exitCode: 1,
        };
    }
  }

  /**
   * Start an interactive session.
   * Returns methods to write to stdin and kill the process.
   */
  async executeInteractive(
    onStdout: (data: string) => void,
    onStderr: (data: string) => void,
  ): Promise<{
    write: (data: string) => void;
    kill: () => void;
    exit: Promise<number>;
  }> {
    await mkdir(this.tempDir, { recursive: true });
    let proc: Subprocess;

    try {
      if (this.language === "python") {
        // Native python3 is required for proper interactive I/O
        // Pyodide is too complex to manage via WebSocket stream for this simple use case
        const filename = "main.py";
        const filePath = join(this.tempDir, filename);
        await writeFile(filePath, this.code);

        proc = spawn(["python3", "-u", filename], {
          cwd: this.tempDir,
          stdout: "pipe",
          stderr: "pipe",
          stdin: "pipe",
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        });
      } else if (
        this.language === "javascript" ||
        this.language === "typescript"
      ) {
        const extension = this.language === "javascript" ? "js" : "ts";
        const filename = `main.${extension}`;
        const filePath = join(this.tempDir, filename);
        await writeFile(filePath, this.code);

        proc = spawn(["bun", "run", filename], {
          cwd: this.tempDir,
          stdout: "pipe",
          stderr: "pipe",
          stdin: "pipe",
          env: { ...process.env, FORCE_COLOR: "0" },
        });
      } else if (this.language === "rust") {
        // Rust compile then run
        await mkdir(join(this.tempDir, "src"), { recursive: true });
        const cargoToml = `[package]\nname="app"\nversion="0.1.0"\nedition="2021"\n[dependencies]`;
        await writeFile(join(this.tempDir, "Cargo.toml"), cargoToml);
        await writeFile(join(this.tempDir, "src", "main.rs"), this.code);

        // First compile (not interactive)
        const build = spawn(["cargo", "build", "--quiet"], {
          cwd: this.tempDir,
        });
        await build.exited;

        if (build.exitCode !== 0) {
          throw new Error("Compilation failed");
        }

        // Run the binary
        proc = spawn(["./target/debug/app"], {
          cwd: this.tempDir,
          stdout: "pipe",
          stderr: "pipe",
          stdin: "pipe",
        });
      } else {
        throw new Error(`Unsupported interactive language: ${this.language}`);
      }

      // Stream handlers
      const readStream = async (
        stream: ReadableStream,
        callback: (d: string) => void,
      ) => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            callback(decoder.decode(value, { stream: true }));
          }
        } catch (e) {
          // Stream error or closed
        }
      };

      if (proc.stdout && typeof proc.stdout !== "number") {
        readStream(proc.stdout as ReadableStream, onStdout);
      }
      if (proc.stderr && typeof proc.stderr !== "number") {
        readStream(proc.stderr as ReadableStream, onStderr);
      }

      return {
        write: (data: string) => {
          if (proc.stdin && typeof proc.stdin !== "number") {
            const writer = (proc.stdin as any).writer
              ? (proc.stdin as any).writer()
              : null;
            // Bun's FileSink usually has write.
            // If implicit typing fails, cast.
            (proc.stdin as any).write(data);
            (proc.stdin as any).flush();
          }
        },
        kill: () => {
          proc.kill();
          rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
        },
        exit: proc.exited.then(async (code) => {
          await rm(this.tempDir, { recursive: true, force: true }).catch(
            () => {},
          );
          return code;
        }),
      };
    } catch (e) {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
      throw e;
    }
  }

  /**
   * Execute JavaScript/TypeScript using 'bun run'
   */
  private async executeJsTs(): Promise<ExecutionResult> {
    try {
      await mkdir(this.tempDir, { recursive: true });

      const extension = this.language === "javascript" ? "js" : "ts";
      const filename = `main.${extension}`;
      const filePath = join(this.tempDir, filename);
      await writeFile(filePath, this.code);

      const proc = spawn(["bun", "run", filename], {
        cwd: this.tempDir,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      // Write inputs if provided
      if (this.inputs && proc.stdin) {
        proc.stdin.write(this.inputs);
        proc.stdin.flush();
        proc.stdin.end();
      }

      return await this.handleProcessWithTimeout(proc);
    } finally {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Execute Python using Pyodide (Isolated)
   */
  private async executePython(): Promise<ExecutionResult> {
    try {
      await mkdir(this.tempDir, { recursive: true });

      const runnerPath = join(this.tempDir, "py_runner.ts");
      const normalizedInputs = this.inputs ? JSON.stringify(this.inputs) : "''";

      const runnerCode = `
import { loadPyodide } from "pyodide";
import { stdin } from "process";

async function main() {
  try {
    const pyodide = await loadPyodide();
    
    // Setup StringIO for stdin/stdout/stderr
    pyodide.runPython(\`
import sys
import traceback
from io import StringIO

__stdin_data = ${normalizedInputs}
sys.stdin = StringIO(__stdin_data)

__stdout = StringIO()
__stderr = StringIO()
sys.stdout = __stdout
sys.stderr = __stderr
    \`);

    const code = ${JSON.stringify(this.code)};
    let exitCode = 0;
    try {
        await pyodide.runPythonAsync(code);
    } catch (err) {
        pyodide.runPython("traceback.print_exc()");
        exitCode = 1;
    }

    const stdout = pyodide.runPython("__stdout.getvalue()");
    const stderr = pyodide.runPython("__stderr.getvalue()");

    process.stdout.write(stdout);
    process.stderr.write(stderr);
    
    process.exit(exitCode);
  } catch (e: any) {
    console.error(e.message || String(e));
    process.exit(1);
  }
}

main();
`;
      await writeFile(runnerPath, runnerCode);

      const proc = spawn(["bun", "run", runnerPath], {
        cwd: this.tempDir,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      });

      return await this.handleProcessWithTimeout(proc);
    } finally {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async executeRust(): Promise<ExecutionResult> {
    try {
      await mkdir(this.tempDir, { recursive: true });
      await mkdir(join(this.tempDir, "src"), { recursive: true });

      const cargoToml = `[package]\nname="compile-project"\nversion="0.1.0"\nedition="2021"\n[dependencies]\n`;
      await writeFile(join(this.tempDir, "Cargo.toml"), cargoToml);
      await writeFile(join(this.tempDir, "src", "main.rs"), this.code);

      const tool = this.tool || "cargo";
      const proc = spawn([tool, ...this.args], {
        cwd: this.tempDir,
        stderr: "pipe",
        stdout: "pipe",
        stdin: "pipe",
      });

      const buildResult = await new Response(proc.stdout).text();
      const buildError = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          stdout: buildResult,
          stderr: buildError,
          exitCode,
        };
      }

      // Check for WASM output
      let wasmPath: string | undefined;
      let wasmBase64: string | undefined;

      if (this.args.some((arg) => arg.includes("wasm32"))) {
        const possiblePaths = [
          join(
            this.tempDir,
            "target",
            "wasm32-wasi",
            "debug",
            "compile_project.wasm",
          ),
          join(
            this.tempDir,
            "target",
            "wasm32-wasip1",
            "debug",
            "compile_project.wasm",
          ),
          join(
            this.tempDir,
            "target",
            "wasm32-wasi",
            "debug",
            "compile-project.wasm",
          ),
          join(
            this.tempDir,
            "target",
            "wasm32-wasip1",
            "debug",
            "compile-project.wasm",
          ),
          join(this.tempDir, "main.wasm"),
        ];

        for (const p of possiblePaths) {
          if (await Bun.file(p).exists()) {
            const buffer = await readFile(p);
            wasmBase64 = buffer.toString("base64");
            wasmPath = p;
            break;
          }
        }
      }

      let runOutput;
      if (wasmPath) {
        runOutput = await this.runWasm(wasmPath);
      }

      if (runOutput) {
        return {
          stdout: runOutput.stdout,
          stderr: runOutput.stderr,
          exitCode: 0,
        };
      }

      return {
        stdout: buildResult,
        stderr: buildError,
        exitCode,
      };
    } finally {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async runWasm(
    wasmPath: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const runnerPath = join(this.tempDir, "runner.ts");

    const runnerCode = `
import { readFile } from "node:fs/promises";
import { WASI } from "node:wasi";

async function main() {
  const wasmPath = process.argv[2];
  if (!wasmPath) throw new Error("No WASM path provided");

  const wasi = new WASI({
    version: "preview1",
    args: ["main.wasm"],
    env: {},
  });

  const wasm = await readFile(wasmPath);
  const module = await WebAssembly.compile(wasm);
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  wasi.start(instance);
}

main().catch(console.error);
`;
    await writeFile(runnerPath, runnerCode);

    const proc = spawn(["bun", "run", runnerPath, wasmPath], {
      cwd: this.tempDir,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    });

    if (this.inputs && proc.stdin) {
      proc.stdin.write(this.inputs);
      proc.stdin.flush();
      proc.stdin.end();
    }

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return { stdout, stderr };
  }

  /**
   * Generic helper to wait for a spawned process with a timeout.
   * Kills the process if it exceeds the timeout.
   */
  private async handleProcessWithTimeout(proc: any): Promise<ExecutionResult> {
    let timer: Timer | null = null;
    let timedOut = false;

    const timeoutPromise = new Promise<ExecutionResult>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        proc.kill(); // Kill the process
        resolve({
          stdout: "",
          stderr: `Execution timeout after ${this.timeout}ms`,
          exitCode: 124,
        });
      }, this.timeout);
    });

    const executionPromise = (async () => {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      if (timer) clearTimeout(timer);

      if (timedOut) {
        return { stdout: "", stderr: "", exitCode: 124 };
      }

      return {
        stdout,
        stderr,
        exitCode,
      };
    })();

    return Promise.race([executionPromise, timeoutPromise]);
  }
}
