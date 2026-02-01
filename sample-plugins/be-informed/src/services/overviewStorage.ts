import path from "path";
import { file, write } from "bun";

export class OverviewStorage {
  private static getFilePath(
    candidate: string,
    state: string,
    office: string,
    district?: string,
  ): string {
    const safeCandidate = candidate
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_");
    const safeState = state.toLowerCase();
    const safeOffice = office.toLowerCase();
    const safeDistrict = district ? `_d${district}` : "";

    const filename = `${safeCandidate}_${safeState}_${safeOffice}${safeDistrict}.md`;
    return path.resolve(import.meta.dir, "../../data/overviews", filename);
  }

  static async getStoredOverview(
    candidate: string,
    state: string,
    office: string,
    district?: string,
  ): Promise<string | null> {
    const filePath = this.getFilePath(candidate, state, office, district);
    const f = file(filePath);
    if (await f.exists()) {
      return await f.text();
    }
    return null;
  }

  static async saveOverview(
    candidate: string,
    state: string,
    office: string,
    district: string | undefined,
    content: string,
  ): Promise<void> {
    const filePath = this.getFilePath(candidate, state, office, district);

    const dirname = path.dirname(filePath);
    const fs = await import("node:fs/promises");
    await fs.mkdir(dirname, { recursive: true });

    await write(filePath, content);
  }
}
