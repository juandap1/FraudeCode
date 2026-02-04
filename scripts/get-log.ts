import fs from "fs";
import path from "path";
import { platform, homedir } from "os";

// ----------------------------------------------------------------------------
// Re-implementation of src/utils/paths.ts logic to keep this script standalone
// ----------------------------------------------------------------------------

function getConfigDir(appName: string): string {
  const osPlatform = platform();
  const home = homedir();

  switch (osPlatform) {
    case "win32":
      return path.join(
        process.env.APPDATA || path.join(home, "AppData", "Roaming"),
        appName,
      );
    case "darwin":
      return path.join(home, "Library", "Application Support", appName);
    case "linux":
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
        appName,
      );
    default:
      return path.join(home, `.${appName}`);
  }
}

// ----------------------------------------------------------------------------
// Re-implementation of src/utils/logger.ts logic
// ----------------------------------------------------------------------------

const getLogPath = () => {
  const configDir = getConfigDir("fraude-code");
  if (!fs.existsSync(configDir)) {
    // If the config dir doesn't exist, the log probably doesn't either,
    // but the original code creates it here.
    try {
      fs.mkdirSync(configDir, { recursive: true });
    } catch (e) {
      // Ignore error if it already exists or cannot be implemented for this read-only script goal
    }
  }
  return path.join(configDir, "debug.log");
};

// ----------------------------------------------------------------------------
// Main Script Execution
// ----------------------------------------------------------------------------

console.log("Attempting to retrieve debug log...");

try {
  const sourcePath = getLogPath();
  const destPath = path.join(process.cwd(), "debug.log");

  console.log(`Looking for log at: ${sourcePath}`);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✅ Success! Debug log written to: ${destPath}`);
  } else {
    console.error("❌ Error: No debug log found at the expected location.");
    console.error(`Checked path: ${sourcePath}`);
    process.exit(1);
  }
} catch (error) {
  console.error("❌ An unexpected error occurred:", error);
  process.exit(1);
}
