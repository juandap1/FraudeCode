import { platform, homedir } from "os";
import { join } from "path";

export function getConfigDir(appName: string): string {
  const osPlatform = platform();
  const home = homedir();

  switch (osPlatform) {
    case "win32":
      return join(
        process.env.APPDATA || join(home, "AppData", "Roaming"),
        appName,
      );
    case "darwin":
      return join(home, "Library", "Application Support", appName);
    case "linux":
      return join(
        process.env.XDG_CONFIG_HOME || join(home, ".config"),
        appName,
      );
    default:
      return join(home, `.${appName}`);
  }
}
