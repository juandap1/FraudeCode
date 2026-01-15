import { mkdir } from "node:fs/promises";

const initFraude = async () => {
  const cwd = process.cwd();
  await mkdir(`${cwd}/.fraude`, { recursive: true });
};

export default initFraude;
