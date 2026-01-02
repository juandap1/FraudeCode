import * as fs from "fs";
import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";

const { updateOutput, updateInteraction } = useFraudeStore.getState();
export const createSaveChangesNode = (
  promptUserConfirmation: () => Promise<boolean>
) => {
  return async (state: AgentStateType) => {
    updateOutput("log", "Waiting for user confirmation");

    const confirmed = await promptUserConfirmation();
    updateInteraction(state.id, { status: 1 });

    if (confirmed) {
      const changesToSave = state.pendingChanges || [];
      updateOutput(
        "log",
        `✅ User confirmed. Saving ${changesToSave.length} change(s)...`
      );

      for (const change of changesToSave) {
        try {
          fs.writeFileSync(change.absPath, change.newContent, "utf8");
          updateOutput("log", `✓ Saved: ${change.filePath}`);
        } catch (err) {
          console.error(`[saveChanges] Error writing file: ${err}`);
          updateOutput("log", `✗ Failed: ${change.filePath}`);
        }
      }

      updateOutput("log", "🎉 All changes saved successfully!");

      return {
        userConfirmed: true,
        status: "completed",
      };
    } else {
      updateOutput("log", "❌ Changes discarded by user.");

      return {
        userConfirmed: false,
        status: "cancelled",
      };
    }
  };
};
