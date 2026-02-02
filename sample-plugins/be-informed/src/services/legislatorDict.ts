import { YAML } from "bun";
import path from "path";

// Interfaces for type safety matching the YAML structure
export interface LegislatorId {
  bioguide: string;
  thomas?: string;
  lis?: string;
  govtrack?: number;
  opensecrets?: string;
  votesmart?: number;
  fec?: string[];
  cspan?: number;
  wikipedia?: string;
  house_history?: number;
  ballotpedia?: string;
  maplight?: number;
  icpsr?: number;
  wikidata?: string;
  google_entity_id?: string;
}

export interface LegislatorName {
  first: string;
  last: string;
  official_full?: string;
}

export interface LegislatorBio {
  birthday?: string;
  gender?: string;
}

export interface LegislatorTerm {
  type: string;
  start: string;
  end: string;
  state: string;
  class?: number;
  party: string;
}

export interface Legislator {
  id: LegislatorId;
  name: LegislatorName;
  bio?: LegislatorBio;
  terms?: LegislatorTerm[];
}

class LegislatorDict {
  private static instance: LegislatorDict;
  private currentLegislators: Legislator[] = [];
  private pastLegislators: Legislator[] = [];
  private isInitialized = false;
  private fecToLegislatorMap = new Map<string, Legislator>();

  private constructor() {}

  public static getInstance(): LegislatorDict {
    if (!LegislatorDict.instance) {
      LegislatorDict.instance = new LegislatorDict();
    }
    return LegislatorDict.instance;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Resolve paths relative to this file's directory
      // Assumptions: This file is in src/services and data is in ../../data/
      const dataDir = path.resolve(import.meta.dir, "../../data");
      const currentPath = path.join(dataDir, "legislators-current.yaml");
      const pastPath = path.join(dataDir, "legislators-historical.yaml");

      const [currentText, pastText] = await Promise.all([
        Bun.file(currentPath).text(),
        Bun.file(pastPath).text(),
      ]);

      this.currentLegislators = YAML.parse(currentText) as Legislator[];
      this.pastLegislators = YAML.parse(pastText) as Legislator[];

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize LegislatorDict", error);
      throw error;
    }
  }

  get current(): Legislator[] {
    this.ensureInitialized();
    return this.currentLegislators;
  }

  get past(): Legislator[] {
    this.ensureInitialized();
    return this.pastLegislators;
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  public async getLegislatorByBioguideId(
    bioguideId: string,
  ): Promise<Legislator | undefined> {
    await this.ensureInitialized();
    return (
      this.currentLegislators.find((l) => l.id.bioguide === bioguideId) ||
      this.pastLegislators.find((l) => l.id.bioguide === bioguideId)
    );
  }

  public async getLegislatorByFecId(
    fecId: string,
  ): Promise<Legislator | undefined> {
    await this.ensureInitialized();
    let legislator = this.fecToLegislatorMap.get(fecId);
    if (legislator) return legislator;
    legislator =
      this.currentLegislators.find((l) => l.id.fec?.includes(fecId)) ||
      this.pastLegislators.find((l) => l.id.fec?.includes(fecId));
    if (legislator) this.fecToLegislatorMap.set(fecId, legislator);
    return legislator;
  }
}

export default LegislatorDict;
