import { structuredPatch } from "diff";
import { projectPath } from "@/utils";
import log from "@/utils/logger";
import { unlink } from "node:fs/promises";
import AgentCognition from "@/utils/agentCognition";

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
  linedelimiters?: string[];
}

export interface DiffPatch {
  oldFileName?: string;
  newFileName?: string;
  oldHeader?: string;
  newHeader?: string;
  hunks: Hunk[];
}

export interface PendingChange {
  id: string;
  path: string;
  type: "edit" | "write";
  originalContent: string | null;
  newContent: string;
  diff: DiffPatch;
  feedback?: string;
  hidden?: boolean;
}

class PendingChangesManager {
  private changes: Map<string, PendingChange> = new Map();

  public async addChange(
    path: string,
    newContent: string,
    type: "edit" | "write",
    options?: { hidden?: boolean },
  ): Promise<PendingChange> {
    // Normalize to absolute path
    if (!path.startsWith("/")) {
      path = `${process.cwd()}/${path}`;
    }

    // Clean up any double slashes or .
    // Ideally use path.resolve but simple string concat is often enough or import path module
    const { resolve } = await import("path");
    path = resolve(path);

    // Check if there are existing changes for this path
    const changesList = Array.from(this.changes.values());
    const latestChange = changesList.reverse().find((c) => c.path === path);
    // Inherit hidden status if strictly true (was created hidden)
    // If explicitly provided in options, use that. Otherwise use inherited.
    const isHidden = options?.hidden ?? latestChange?.hidden;

    const originalContent = latestChange
      ? latestChange.newContent
      : (await Bun.file(path).exists())
        ? await Bun.file(path).text()
        : "";

    // Create unified diff
    // For new files, originalContent is empty string.
    // We use path as both old and new filename for the patch header
    const diff = structuredPatch(
      projectPath(path),
      projectPath(path),
      originalContent || "",
      newContent,
      "",
      "",
      { context: 2 },
    );

    const change: PendingChange = {
      id: crypto.randomUUID(),
      path,
      type,
      originalContent: type === "edit" ? originalContent : null,
      newContent,
      diff,
      hidden: isHidden,
    };

    this.changes.set(change.id, change);
    return change;
  }

  public getChange(id: string): PendingChange | undefined {
    return this.changes.get(id);
  }

  public getChanges(): PendingChange[] {
    return Array.from(this.changes.values()).filter((c) => !c.hidden);
  }

  public getAllChangesGrouped(): Record<string, PendingChange[]> {
    const grouped: Record<string, PendingChange[]> = {};
    for (const change of this.changes.values()) {
      if (change.hidden) continue;
      if (!grouped[change.path]) {
        grouped[change.path] = [];
      }
      grouped[change.path]?.push(change);
    }
    return grouped;
  }

  public hasChanges(): boolean {
    return Array.from(this.changes.values()).some((c) => !c.hidden);
  }

  public async applyChange(id: string): Promise<boolean> {
    const change = this.changes.get(id);
    if (!change) return false;

    try {
      await Bun.write(change.path, change.newContent);
      this.changes.delete(id);
      log(`Applied change to ${change.path}`);

      // Index the file to update knowledge graph
      try {
        const cognition = AgentCognition.getInstance();
        await cognition.init();
        // Fire and forget indexing to avoid blocking UI
        cognition
          .indexFile(change.path)
          .catch((e) => log(`Indexing failed for ${change.path}: ${e}`));
      } catch (e) {
        log(`Failed to trigger indexing: ${e}`);
      }

      return true;
    } catch (error) {
      if (change) {
        log(`Failed to apply change to ${change.path}: ${error}`);
      }
      return false;
    }
  }

  public async applyAll(): Promise<void> {
    for (const [id, change] of this.changes) {
      if (change.hidden) continue;
      await this.applyChange(id);
    }
  }

  public async applyChangeTemporary(id: string): Promise<boolean> {
    const change = this.changes.get(id);
    if (!change) return false;

    try {
      await Bun.write(change.path, change.newContent);
      // Differs from applyChange: DOES NOT DELETE from this.changes
      log(`Temporarily applied change to ${change.path}`);
      return true;
    } catch (error) {
      if (change) {
        log(`Failed to apply temporary change to ${change.path}: ${error}`);
      }
      return false;
    }
  }

  public async applyAllTemporary(): Promise<void> {
    log(`applyAllTemporary called with ${this.changes.size} changes`);
    for (const id of this.changes.keys()) {
      await this.applyChangeTemporary(id);
    }
  }

  public async restoreChange(id: string): Promise<boolean> {
    const change = this.changes.get(id);
    if (!change) return false;

    try {
      if (change.originalContent === null) {
        // It was a new file, so delete it
        const file = Bun.file(change.path);
        if (await file.exists()) {
          await unlink(change.path);
        }
      } else {
        // Restore original content
        await Bun.write(change.path, change.originalContent);
      }
      // Note: We do NOT delete the change from the map, because we are just reverting the disk state
      // but keeping the "pending change" in memory (e.g. for further editing or final apply).
      log(`Restored ${change.path}`);
      return true;
    } catch (error) {
      log(`Failed to restore ${change.path}: ${error}`);
      return false;
    }
  }

  public async restoreAll(): Promise<void> {
    log(`restoreAll called with ${this.changes.size} changes`);
    // Restore in reverse order to correct handle multiple changes to the same file
    const ids = Array.from(this.changes.keys()).reverse();
    for (const id of ids) {
      await this.restoreChange(id);
    }
  }

  public rejectChange(id: string): boolean {
    return this.changes.delete(id);
  }

  public rejectAll(): void {
    this.changes.clear();
  }

  public addFeedback(id: string, feedback: string): boolean {
    const change = this.changes.get(id);
    if (!change) return false;

    change.feedback = feedback;
    return true;
  }

  public clear() {
    this.changes.clear();
  }
  /**
   * Gets the content of a file, accounting for any pending changes.
   * If there are pending changes, returns the new content of the most recent change.
   * Otherwise, reads the file from disk.
   */
  public async getLatestContent(path: string): Promise<string> {
    // Check pending changes first (reverse order to find latest)
    // We include hidden changes here because the agent (e.g., test runner)
    // needs to see the "current state" including temporary files it just created.
    const changes = Array.from(this.changes.values()).reverse();
    const latestChange = changes.find((c) => c.path === path);

    if (latestChange) {
      return latestChange.newContent;
    }

    // If no pending changes, read from disk
    const file = Bun.file(path);
    if (await file.exists()) {
      return await file.text();
    }
    return "";
  }

  public getDiffStats(diff: DiffPatch): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) added++;
        if (line.startsWith("-")) removed++;
      }
    }
    return { added, removed };
  }
}

const pendingChanges = new PendingChangesManager();
export default pendingChanges;
