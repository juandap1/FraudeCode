import { tool } from "ai";
import { z } from "zod";
import path from "path";
import { getLSPClient } from "@/utils/lspClient";
import pendingChanges from "@/agent/pendingChanges";
import { projectPath } from "@/utils";
import useFraudeStore from "@/store/useFraudeStore";
import DESCRIPTION from "./descriptions/lsp.txt" with { type: "text" };

const { updateOutput } = useFraudeStore.getState();

/**
 * Find a symbol's position in the file content
 * Returns the line and character where the symbol starts
 */
function findSymbolPosition(
  content: string,
  symbolName: string,
  occurrence: number = 1,
): { line: number; character: number } | null {
  const lines = content.split("\n");
  let found = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let searchStart = 0;

    while (true) {
      const idx = line.indexOf(symbolName, searchStart);
      if (idx === -1) break;

      // Check it's a word boundary (not part of a larger identifier)
      const beforeChar = idx > 0 ? line[idx - 1] : " ";
      const afterChar =
        idx + symbolName.length < line.length
          ? line[idx + symbolName.length]
          : " ";
      const isWordBoundary =
        !/[a-zA-Z0-9_]/.test(beforeChar!) && !/[a-zA-Z0-9_]/.test(afterChar!);

      if (isWordBoundary) {
        found++;
        if (found === occurrence) {
          return { line: i + 1, character: idx + 1 }; // 1-indexed
        }
      }

      searchStart = idx + 1;
    }
  }

  return null;
}

/**
 * LSP Tool - Code analysis using symbol names (LLM-friendly)
 */
const lspTool = tool({
  description: DESCRIPTION,
  strict: true,
  inputSchema: z.object({
    command: z
      .enum([
        "analyze",
        "lookup",
        "info",
        "references",
        "implementation",
        "symbols",
        "workspace_symbols",
        "call_hierarchy",
        "incoming_calls",
        "outgoing_calls",
      ])
      .describe(
        "analyze: check for errors | lookup: find definition | info: get type/docs | references: find usages | implementation: find implementations | symbols: list document symbols | workspace_symbols: search workspace | call_hierarchy: get call hierarchy | incoming_calls: who calls this | outgoing_calls: what this calls",
      ),
    filePath: z.string().describe("Relative path to the file"),
    symbol: z
      .string()
      .optional()
      .describe(
        "Name of the symbol (required for lookup/info/references/implementation/call_hierarchy/incoming_calls/outgoing_calls)",
      ),
    query: z
      .string()
      .optional()
      .describe("Search query for workspace_symbols command"),
    occurrence: z
      .number()
      .optional()
      .describe("Which occurrence of the symbol to use (default: 1 = first)"),
  }),
  execute: async ({ command, filePath, symbol, query, occurrence = 1 }) => {
    const client = getLSPClient(process.cwd());
    // Resolve path, handling @/ alias which maps to project root
    let fullPath = filePath;
    if (fullPath.startsWith("@/")) {
      fullPath = fullPath.replace("@/", "");
      fullPath = path.resolve(process.cwd(), fullPath);
    } else {
      fullPath = path.resolve(process.cwd(), filePath);
    }

    // Get file content including pending changes
    const content = await pendingChanges.getLatestContent(fullPath);

    if (!content) {
      return `Error: File not found: ${filePath}`;
    }

    if (!client.isSupported(filePath)) {
      const supported = client.getSupportedExtensions().join(", ");
      return `Error: File type not supported. Supported: ${supported}`;
    }

    try {
      let result = "";
      switch (command) {
        case "analyze": {
          const { errors, warnings } = await client.getDiagnostics(
            fullPath,
            content,
          );

          if (errors.length === 0 && warnings.length === 0) {
            result = "✓ No errors or warnings found.";
            break;
          }

          const parts: string[] = [];
          if (errors.length > 0) {
            parts.push(
              `ERRORS (${errors.length}):\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`,
            );
          }
          if (warnings.length > 0) {
            parts.push(
              `WARNINGS (${warnings.length}):\n${warnings.map((w) => `  ⚠ ${w}`).join("\n")}`,
            );
          }
          result = parts.join("\n\n");
          break;
        }

        case "lookup": {
          if (!symbol) {
            return "Error: 'symbol' is required. Provide the name of the function, class, or variable to look up.";
          }

          const pos = findSymbolPosition(content, symbol, occurrence);
          if (!pos) {
            return `Symbol '${symbol}' not found in file. Check the spelling or try a different occurrence.`;
          }

          const def = await client.findDefinition(
            fullPath,
            content,
            pos.line,
            pos.character,
          );

          if (!def) {
            return `No definition found for '${symbol}'. It may be a built-in or the LSP couldn't resolve it.`;
          }

          result = `DEFINITION OF '${symbol}':\n  File: ${def.file}\n  Line: ${def.line}`;
          if (def.preview) {
            result += `\n\nCODE:\n${def.preview}`;
          }
          break;
        }

        case "info": {
          if (!symbol) {
            return "Error: 'symbol' is required. Provide the name of the symbol to get info about.";
          }

          const pos = findSymbolPosition(content, symbol, occurrence);
          if (!pos) {
            return `Symbol '${symbol}' not found in file.`;
          }

          const info = await client.getSymbolInfo(
            fullPath,
            content,
            pos.line,
            pos.character,
          );

          if (!info) {
            return `No type information found for '${symbol}'.`;
          }

          result = `INFO FOR '${symbol}':\n${info}`;
          break;
        }

        case "references": {
          if (!symbol) {
            return "Error: 'symbol' is required. Provide the name of the symbol to find references for.";
          }

          const pos = findSymbolPosition(content, symbol, occurrence);
          if (!pos) {
            return `Symbol '${symbol}' not found in file.`;
          }

          const refs = await client.findReferences(
            fullPath,
            content,
            pos.line,
            pos.character,
          );

          if (refs.length === 0) {
            return `No references found for '${symbol}'.`;
          }

          // Group by file
          const grouped: Record<string, number[]> = {};
          for (const ref of refs) {
            const shortPath = ref.file.replace(projectPath(""), "");
            if (!grouped[shortPath]) grouped[shortPath] = [];
            grouped[shortPath]!.push(ref.line);
          }

          const parts = Object.entries(grouped).map(
            ([file, lines]) => `  ${file}: lines ${lines.join(", ")}`,
          );

          result = `REFERENCES TO '${symbol}' (${refs.length} total):\n${parts.join("\n")}`;
          break;
        }

        case "implementation": {
          if (!symbol) {
            return "Error: 'symbol' is required. Provide the name of the interface or method.";
          }

          const pos = findSymbolPosition(content, symbol, occurrence);
          if (!pos) {
            return `Symbol '${symbol}' not found in file.`;
          }

          const impls = await client.findImplementation(
            fullPath,
            content,
            pos.line,
            pos.character,
          );

          if (impls.length === 0) {
            return `No implementations found for '${symbol}'.`;
          }

          const parts = impls.map((impl) => {
            const shortPath = impl.file.replace(projectPath(""), "");
            let res = `  ${shortPath}:${impl.line}`;
            if (impl.preview) {
              res += `\n    ${impl.preview.split("\n")[0]}`;
            }
            return res;
          });

          result = `IMPLEMENTATIONS OF '${symbol}' (${impls.length} total):\n${parts.join("\n")}`;
          break;
        }

        case "symbols": {
          const symbols = await client.getDocumentSymbols(fullPath, content);

          if (symbols.length === 0) {
            return "No symbols found in document.";
          }

          const formatSymbol = (
            sym: { name: string; kind: string; line: number; children?: any[] },
            indent: string = "",
          ): string => {
            let res = `${indent}${sym.kind} ${sym.name} (line ${sym.line})`;
            if (sym.children && sym.children.length > 0) {
              for (const child of sym.children) {
                res += "\n" + formatSymbol(child, indent + "  ");
              }
            }
            return res;
          };

          const lines = symbols.map((s) => formatSymbol(s));
          result = `SYMBOLS IN ${filePath} (${symbols.length} top-level):\n${lines.join("\n")}`;
          break;
        }

        case "workspace_symbols": {
          if (!query) {
            return "Error: 'query' is required for workspace_symbols. Provide a search term.";
          }

          const symbols = await client.searchWorkspaceSymbols(query, fullPath);

          if (symbols.length === 0) {
            return `No symbols matching '${query}' found in workspace.`;
          }

          const lines = symbols.slice(0, 50).map((s) => {
            const shortPath = s.file.replace(projectPath(""), "");
            return `  ${s.kind} ${s.name} - ${shortPath}:${s.line}`;
          });

          result = `WORKSPACE SYMBOLS MATCHING '${query}' (${symbols.length} found):\n${lines.join("\n")}`;
          if (symbols.length > 50) {
            result += `\n  ... and ${symbols.length - 50} more`;
          }
          break;
        }

        case "call_hierarchy": {
          if (!symbol) {
            return "Error: 'symbol' is required. Provide the name of the function or method.";
          }

          const pos = findSymbolPosition(content, symbol, occurrence);
          if (!pos) {
            return `Symbol '${symbol}' not found in file.`;
          }

          const items = await client.prepareCallHierarchy(
            fullPath,
            content,
            pos.line,
            pos.character,
          );

          if (items.length === 0) {
            return `No call hierarchy found for '${symbol}'. It may not be a function/method.`;
          }

          const lines = items.map((item) => {
            const shortPath = item.file.replace(projectPath(""), "");
            return `  ${item.kind} ${item.name} - ${shortPath}:${item.line}`;
          });

          result = `CALL HIERARCHY FOR '${symbol}':\n${lines.join("\n")}`;
          break;
        }

        case "incoming_calls": {
          if (!symbol) {
            return "Error: 'symbol' is required. Provide the name of the function or method.";
          }

          const pos = findSymbolPosition(content, symbol, occurrence);
          if (!pos) {
            return `Symbol '${symbol}' not found in file.`;
          }

          const calls = await client.getIncomingCalls(
            fullPath,
            content,
            pos.line,
            pos.character,
          );

          if (calls.length === 0) {
            return `No incoming calls found for '${symbol}'.`;
          }

          const lines = calls.map((call) => {
            const shortPath = call.file.replace(projectPath(""), "");
            return `  ${call.name} - ${shortPath}:${call.line}`;
          });

          result = `FUNCTIONS CALLING '${symbol}' (${calls.length} total):\n${lines.join("\n")}`;
          break;
        }

        case "outgoing_calls": {
          if (!symbol) {
            return "Error: 'symbol' is required. Provide the name of the function or method.";
          }

          const pos = findSymbolPosition(content, symbol, occurrence);
          if (!pos) {
            return `Symbol '${symbol}' not found in file.`;
          }

          const calls = await client.getOutgoingCalls(
            fullPath,
            content,
            pos.line,
            pos.character,
          );

          if (calls.length === 0) {
            return `No outgoing calls found from '${symbol}'.`;
          }

          const lines = calls.map((call) => {
            const shortPath = call.file.replace(projectPath(""), "");
            return `  ${call.name} - ${shortPath}:${call.line}`;
          });

          result = `FUNCTIONS CALLED BY '${symbol}' (${calls.length} total):\n${lines.join("\n")}`;
          break;
        }

        default:
          return "Unknown command.";
      }

      updateOutput(
        "toolCall",
        JSON.stringify({
          action: `LSP: ${command}`,
          details: `${projectPath(filePath)} ${symbol ? `(${symbol})` : ""}`,
          result: result,
        }),
        { dontOverride: true },
      );

      return result;
    } catch (err: any) {
      return `LSP Error: ${err.message}`;
    }
  },
});

export default lspTool;
