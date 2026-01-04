import type { ModifierStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import type { QdrantPayload } from "../../types/analysis";
import qdrant from "../../services/qdrant";
import log from "../../utils/logger";

const { updateOutput, setStatus } = useFraudeStore.getState();

const indexCode = (content: string, startingLine: number) => {
  const lines = content.split(/\r?\n/);
  const contentWithLineNumbers = lines
    .map((line, index) => `${index + startingLine}: ${line}`)
    .join("\n");
  return contentWithLineNumbers;
};

// const organizePayloadsByFileAndLine = (searchResults: any[]) => {
//   const files: Record<string, QdrantPayload[]> = {};

//   for (const result of searchResults) {
//     const payload: QdrantPayload = result.payload;
//     if (!payload?.filePath) continue;

//     if (!files[payload.filePath]) {
//       files[payload.filePath] = [];
//     }

//     files[payload.filePath]?.push(payload);
//   }

//   // Sort each file's payloads by line number
//   for (const filePath in files) {
//     files[filePath]?.sort((a, b) => {
//       if (a.startLine !== b.startLine) {
//         return a.startLine - b.startLine;
//       }
//       return (a.endLine ?? a.startLine) - (b.endLine ?? b.startLine);
//     });
//   }

//   return files;
// };

const skeletonCode = (payloads: any[], ids: Set<string>) => {
  if (!payloads.length) return "";

  // Sort payloads by startLine, then by endLine (descending)
  const sortedPayloads = [...payloads].sort((a, b) => {
    if (a.startLine !== b.startLine) {
      return a.startLine - b.startLine;
    }
    return (b.endLine ?? b.startLine) - (a.endLine ?? a.startLine);
  });

  let code = "";
  let lastEndLine = 0;

  for (const payload of sortedPayloads) {
    const start = payload.startLine;
    const end = payload.endLine ?? start;

    // If this payload is behind our current line, it's a nested chunk we've already covered
    if (start <= lastEndLine) {
      continue;
    }

    // Gap between chunks
    if (start > lastEndLine + 1) {
      const gapStart = lastEndLine + 1;
      const gapEnd = start - 1;
      code += `${gapStart}${
        gapEnd > gapStart ? ` - ${gapEnd}` : ""
      }: [EMPTY LINES]\n`;
    }

    if (ids.has(payload.id)) {
      code += indexCode(payload.rawDocument, start);
    } else {
      const firstLine = payload.rawDocument.split("\n")[0];
      code += `${start} - ${end}: ${firstLine} ...`;
    }
    code += "\n";

    lastEndLine = end;
  }
  return code;
};

export const createCombineContextNode = () => {
  return async (state: ModifierStateType) => {
    setStatus("Combining context");

    const dependenciesList = state.structuralContext.map((s) => {
      const impacts = s.impactedCallers
        .filter((c: any) => c.name != null)
        .map((c: any) => `${c.file} -> ${c.name}`);
      const impactString =
        "\nIMPACTS: " +
        (impacts.length > 0 ? `[${impacts.join(", ")}]` : "NONE");
      return (
        "[DEPENDENCY]\n" +
        `NAME: ${s.name}\n` +
        `FILE: ${s.filePath}\n` +
        `SIGNATURE: ${s.signature}` +
        impactString
      );
    });
    const dependencies = dependenciesList.join("\n\n") + "\n\n";

    // const organizedPayloads = organizePayloadsByFileAndLine(
    //   state.qdrantResults
    // );
    // const codeContext =
    //   Object.entries(organizedPayloads)
    //     .map(async ([filePath, payloads]) => {
    //       return (
    //         "FILE: " +
    //         filePath +
    //         "\n" +
    //         "CODE:\n" +
    //         payloads
    //           .map((p) => indexCode(p.rawDocument, p.startLine))
    //           .join("\n")
    //       );
    //     })
    //     .join("\n\n") + "\n\n";

    const importantCodeIds: Set<string> = new Set();
    const files: Set<string> = new Set();
    state.qdrantResults.forEach((x) => {
      importantCodeIds.add(x.id);
      files.add(x.payload.filePath);
    });
    log("files: ", files);
    let organizedPayloads: Record<string, any[]> = {};
    for (const filePath of Array.from(files)) {
      log("filePath: ", filePath);
      const fileChunks = await qdrant.getFileChunks(state.repoName, filePath);
      log("fileChunks: ", JSON.stringify(fileChunks, null, 2));
      organizedPayloads[filePath] = fileChunks.map((x) => ({
        id: x.id,
        ...x.payload,
      }));
    }
    // await Promise.all(
    //   Array.from(files).map(async (filePath: string) => {
    //     const fileChunks = await qdrant.getFileChunks("functions", filePath);
    //     organizedPayloads[filePath] = fileChunks.map((x) => ({
    //       id: x.id,
    //       ...x.payload,
    //     }));
    //   })
    // );
    let mappedContext: Record<string, string> = {};
    const codeContext =
      Object.entries(organizedPayloads)
        .map(([filePath, payloads]) => {
          let context =
            "FILE: " +
            filePath +
            "\n" +
            "CODE:\n" +
            skeletonCode(payloads, importantCodeIds);
          mappedContext[filePath] = context;
          return context;
        })
        .join("\n\n") + "\n\n";

    updateOutput("checkpoint", "Combined context");

    return {
      dependencies,
      codeContext,
      mappedContext,
    };
  };
};
