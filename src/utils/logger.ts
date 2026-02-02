import fs from "fs";
import path from "path";
import { getConfigDir } from "./paths";

export const getLogPath = () => {
  const configDir = getConfigDir("fraude-code");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, "debug.log");
};

const log = (...args: any[]) => {
  fs.appendFileSync(
    getLogPath(),
    `[${new Date().toISOString()}] ${args.join(" ")}\n`,
  );
};

export const resetLog = () => {
  fs.writeFileSync(getLogPath(), "");
};

export default log;
