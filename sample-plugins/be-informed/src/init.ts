import fs from "fs/promises";
import path from "path";
import OpenFEC from "./services/openFEC";
import { Settings, UpdateSettings } from "@/config/settings";

async function main(force = false) {
  const settings = Settings.getInstance().get("pluginSettings");
  const informed = settings.informed || {};
  const lastUpdated = informed.lastUpdated;
  const now = new Date();

  if (lastUpdated && !force) {
    const lastDate = new Date(lastUpdated);
    const diff = now.getTime() - lastDate.getTime();
    const weekInMs = 7 * 24 * 60 * 60 * 1000;
    if (diff < weekInMs) {
      return;
    }
  }

  await getLegislatorDict();
  await OpenFEC.getInstance().getAllCandidates(true);

  await UpdateSettings({
    pluginSettings: {
      ...settings,
      informed: {
        ...informed,
        lastUpdated: now.toISOString(),
      },
    },
  });
}

async function getLegislatorDict() {
  // Get legislator id "Rosetta Stone"
  const currentLegislators =
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/refs/heads/main/legislators-current.yaml";
  const pastLegislators =
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/refs/heads/main/legislators-historical.yaml";

  const allLegislators = Promise.all([
    fetch(currentLegislators),
    fetch(pastLegislators),
  ]);

  const [currentResponse, pastResponse] = await allLegislators;

  const currentData = await currentResponse.text();
  const pastData = await pastResponse.text();

  const dataDir = path.join(__dirname, "../data");

  // Ensure directory exists (recursive just in case, though we checked it exists)
  await fs.mkdir(dataDir, { recursive: true });

  await fs.writeFile(
    path.join(dataDir, "legislators-current.yaml"),
    currentData,
  );
  await fs.writeFile(
    path.join(dataDir, "legislators-historical.yaml"),
    pastData,
  );
}

export default main;
