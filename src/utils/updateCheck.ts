import semver from "semver";
export async function checkForUpdate(
  currentVersion: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://registry.npmjs.org/fraude-code/latest",
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { version: string };
    const latestVersion = data.version;

    if (semver.gt(latestVersion, currentVersion)) {
      return latestVersion;
    }
  } catch (error) {
    // Silently fail to not disrupt user experience
  }
  return null;
}
