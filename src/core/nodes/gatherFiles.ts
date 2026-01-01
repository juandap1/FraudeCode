import * as fs from "fs";
import * as path from "path";
import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import log from "../../utils/logger";

const { updateOutput, setStatus } = useFraudeStore.getState();

export const createGatherFilesNode = () => {
  return async (state: AgentStateType) => {
    setStatus("Reading file contents");
    log("Gathering files state: ", JSON.stringify(state, null, 2));

    const fileContents: Record<string, string> = {};

    for (const filePath of state.filePaths || []) {
      const absPath = path.join(state.repoPath, filePath);
      log(`Reading: ${absPath}`);
      if (fs.existsSync(absPath)) {
        setStatus(`Reading: ${filePath}`);
        fileContents[filePath] = fs.readFileSync(absPath, "utf8");
      }
    }

    let codeContext = "";
    for (const [filePath, content] of Object.entries(fileContents)) {
      const lines = content.split(/\r?\n/);
      const contentWithLineNumbers = lines
        .map((line, index) => `${index + 1}: ${line}`)
        .join("\n");
      codeContext += `--- FILE: ${filePath} ---\n${contentWithLineNumbers}\n`;
    }

    updateOutput("log", `Loaded ${Object.keys(fileContents).length} file(s).`);
    updateOutput("checkpoint", "Gathered files");
    log("Gathered files: ", Object.keys(fileContents));

    return {
      codeContext,
      status: "files_gathered",
    };
  };
};
