import * as fs from "fs";
import * as path from "path";
import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

export const createGatherFilesNode = () => {
  return async (state: AgentStateType) => {
    updateOutput("log", "📄 [STEP 3/4] Reading file contents...");

    const fileContents: Record<string, string> = {};

    for (const filePath of state.filePaths || []) {
      const absPath = path.join(state.repoPath, "..", filePath);
      if (fs.existsSync(absPath)) {
        updateOutput("log", `Reading: ${filePath}`);
        fileContents[filePath] = fs.readFileSync(absPath, "utf8");
      }
    }

    let codeContext = "";
    for (const [filePath, content] of Object.entries(fileContents)) {
      codeContext += `--- FILE: ${filePath} ---${content}`;
    }

    updateOutput("log", `Loaded ${Object.keys(fileContents).length} file(s).`);

    return {
      codeContext,
      status: "files_gathered",
    };
  };
};
