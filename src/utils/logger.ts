import fs from "fs";

const log = (...args: any[]) => {
  fs.appendFileSync(
    "debug.log",
    `[${new Date().toISOString()}] ${args.join(" ")}\n`
  );
};

export const resetLog = () => {
  fs.writeFileSync("debug.log", "");
};

export default log;
