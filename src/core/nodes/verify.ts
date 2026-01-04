import type { ModifierStateType, PendingChange } from "../../types/state";
import { applyTargetedChanges } from "../../utils/CodeModifier";
import { useFraudeStore } from "../../store/useFraudeStore";

const { updateOutput, updateInteraction, setStatus } =
  useFraudeStore.getState();
export const createVerifyNode = () => {
  return async (state: ModifierStateType) => {
    setStatus("Computing changes");

    const pendingChanges = applyTargetedChanges(
      state.modifications,
      state.repoPath,
      updateOutput as any
    );

    // setStatus(
    //   `[verifyNode] Computed ${pendingChanges.length} pending changes:`
    // );
    for (const change of pendingChanges) {
      setStatus(`  - ${change.filePath} -> ${change.absPath}`);
    }

    updateInteraction(state.id, { pendingChanges });

    updateOutput("diff", "", "Code Changes", pendingChanges);

    setStatus(`${pendingChanges.length} change(s) computed`);

    return {
      pendingChanges,
      status: "awaiting_confirmation",
    };
  };
};
