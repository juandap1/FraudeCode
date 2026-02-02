import path from "path";
import log from "@/utils/logger";
import LegislatorDict from "./legislatorDict";
import { getMemberById } from "./congressData";
import { getApiKey } from "../utils/keys";

const getOpenFecKey = () =>
  getApiKey("GOV_DATA_API_KEY") || getApiKey("OPENFEC_API_KEY");

interface OpenFECResponse {
  pagination: {
    pages: number;
    count: number;
    page: number;
    per_page: number;
  };
  results: any[];
}

class OpenFEC {
  private static instance: OpenFEC;
  private constructor() {}
  public static getInstance(): OpenFEC {
    if (!OpenFEC.instance) {
      OpenFEC.instance = new OpenFEC();
    }
    return OpenFEC.instance;
  }

  async getAllCandidates(overrideCache = false) {
    const dataPath = path.join(import.meta.dir, "../../data/candidates.json");
    const file = Bun.file(dataPath);

    if ((await file.exists()) && !overrideCache) {
      try {
        const cachedData = await file.json();
        const lastUpdated = new Date(cachedData.lastUpdated);
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        if (lastUpdated > oneWeekAgo) {
          log(
            `Returning cached candidates data from ${lastUpdated.toISOString()}`,
          );
          return cachedData.results;
        }
        log(`Cached data is older than a week. Fetching fresh data...`);
      } catch (error) {
        log(`Error reading cached data, fetching fresh: ${error}`);
      }
    } else {
      log(`No cached data found at ${dataPath}. Fetching fresh data...`);
    }

    const apiKey = getOpenFecKey();
    if (!apiKey) {
      throw new Error(
        "GOV_DATA_API_KEY or OPENFEC_API_KEY is not defined in settings or environment variables",
      );
    }

    const resultsMap = new Map<string, any>();
    let page = 1;
    let totalPages = 1;

    log(`Fetching candidates from OpenFEC...`);

    do {
      log(`Fetching page ${page} of ${totalPages === 1 ? "?" : totalPages}...`);
      const response = await fetch(
        `https://api.open.fec.gov/v1/candidates/totals/?page=${page}&per_page=100&election_year=2026&has_raised_funds=true&is_active_candidate=true&api_key=${apiKey}`,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch OpenFEC data: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as OpenFECResponse;
      for (const result of data.results) {
        resultsMap.set(result.candidate_id, result);
      }
      totalPages = data.pagination.pages;
      page++;
    } while (page <= totalPages);

    const allResults = Array.from(resultsMap.values());

    for (let i in allResults) {
      const result = allResults[i];
      const legislator =
        await LegislatorDict.getInstance().getLegislatorByFecId(
          result.candidate_id,
        );
      if (legislator) {
        allResults[i].bioguide_id = legislator.id.bioguide;
        allResults[i].opensecrets_id = legislator.id.opensecrets;
        allResults[i].wikidata_id = legislator.id.wikidata;
        const moreInfo = await getMemberById(legislator.id.bioguide);
        if (moreInfo) allResults[i] = { ...result, ...moreInfo };
      }
    }

    const resultData = {
      lastUpdated: new Date().toISOString(),
      results: allResults,
    };

    try {
      await Bun.write(dataPath, JSON.stringify(resultData, null, 2));
      log(`Successfully saved ${allResults.length} candidates to ${dataPath}`);
    } catch (error) {
      log(`Error saving candidates data: ${error}`);
    }

    return allResults;
  }

  async getStateCandidates(
    state: string,
    office?: "H" | "S" | "P",
    district?: string,
  ) {
    const candidates = await this.getAllCandidates();

    let filtered = candidates.filter((c: any) => {
      if (state && c.state !== state) return false;
      if (office && c.office !== office) return false;
      if (district && c.district !== district) return false;
      if (parseFloat(c.cash_on_hand_end_period) <= 0) return false;
      if (c.receipts <= 5000) return false;
      return true;
    });

    const statusOrder: Record<string, number> = { I: 0, C: 1, O: 2 };

    filtered.sort((a: any, b: any) => {
      // Primary sort: incumbent_challenge status (I, then C, then O)
      const aStatus = a.incumbent_challenge || "";
      const bStatus = b.incumbent_challenge || "";

      const aOrder = statusOrder[aStatus as keyof typeof statusOrder] ?? 99;
      const bOrder = statusOrder[bStatus as keyof typeof statusOrder] ?? 99;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      // Secondary sort: receipts (largest first)
      const aReceipts = parseFloat(a.cash_on_hand_end_period || "0");
      const bReceipts = parseFloat(b.cash_on_hand_end_period || "0");

      return bReceipts - aReceipts;
    });

    return filtered;
  }
}

export default OpenFEC;
