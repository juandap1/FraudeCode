import { execSync } from "child_process";
import fs from "fs";

const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const externals = Object.keys(pkg.dependencies || {})
  .map((dep) => `--external ${dep}`)
  .join(" ");

const command = `bun build src/index.tsx --target bun --outdir dist ${externals}`;
console.log(`Running: ${command}`);

try {
  execSync(command, { stdio: "inherit" });
  console.log("Build successful!");
} catch (e) {
  console.error("Build failed");
  process.exit(1);
}
