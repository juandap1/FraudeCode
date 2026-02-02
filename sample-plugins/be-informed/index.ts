import init from "./src/init";
import OpenFEC from "./src/services/openFEC";
import {
  getMemberSponsoredLegislation,
  getMemberCosponsoredLegislation,
} from "./src/services/congressData";
import { getCandidateResearchAgent } from "./src/candidateResearchAgent";
import { getLegislativeAnalyst } from "./src/legislativeAnalyst";
import { OverviewStorage } from "./src/services/overviewStorage";
import { getApiKey } from "./src/utils/keys";
import type { PluginContext, PluginInit } from "@/types/PluginContext";
import type { Command } from "@/types/CommandDefinition";

const plugin: PluginInit = async (context: PluginContext) => {
  const { Router, settings, ui, log } = context;
  const { updateOutput } = ui;

  const authOpenFEC = async (args: string[]) => {
    const apiKey = args[0];
    if (!apiKey) {
      updateOutput("error", "No API key specified (OpenFEC)");
      return;
    }
    const currentSettings = settings.get("pluginSettings");
    await settings.update({
      pluginSettings: {
        ...currentSettings,
        informed: {
          ...(currentSettings.informed || {}),
          OPENFEC_API_KEY: apiKey,
        },
      },
    });
    updateOutput("log", "OpenFEC API key set");
  };

  const authGovData = async (args: string[]) => {
    const apiKey = args[0];
    if (!apiKey) {
      updateOutput("error", "No API key specified (GovData)");
      return;
    }
    const currentSettings = settings.get("pluginSettings");
    await settings.update({
      pluginSettings: {
        ...currentSettings,
        informed: {
          ...(currentSettings.informed || {}),
          GOV_DATA_API_KEY: apiKey,
        },
      },
    });
    updateOutput("log", "GovData API key set");
  };

  // Use shared router from context
  const router = context.router;
  await init();

  router.register("GET", "/informed/healthcheck", (req) => {
    return new Response("Be Informed plugin is healthy", {
      headers: { "Content-Type": "text/plain" },
    });
  });

  router.register("POST", "/keys", async (req) => {
    const body = await req.json();
    const currentSettings = settings.get("pluginSettings");
    await settings.update({
      pluginSettings: {
        ...currentSettings,
        informed: body,
      },
    });
    return new Response("OK", {
      headers: { "Content-Type": "text/plain" },
      status: 200,
    });
  });

  router.register("GET", "/candidates", async (req) => {
    const data = await OpenFEC.getInstance().getAllCandidates();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  });

  router.register("GET", "/candidates/:state", async (req) => {
    const state = req.params.state!;
    const url = new URL(req.url);
    const office = url.searchParams.get("office") as "H" | "S" | "P" | null;
    const district = url.searchParams.get("district");
    const data = await OpenFEC.getInstance().getStateCandidates(
      state,
      office || undefined,
      district || undefined,
    );
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  });

  router.register("GET", "/candidate/overview", async (req) => {
    const url = new URL(req.url);
    const candidate = url.searchParams.get("candidate");
    const state = url.searchParams.get("state");
    const office = url.searchParams.get("office");
    const district = url.searchParams.get("district") || undefined;
    const bioguideId = url.searchParams.get("bioguideId");

    if (!candidate || !state || !office) {
      return new Response(
        "Missing required query params: candidate, state, office",
        { status: 400 },
      );
    }

    // 1. Check Cache
    const cachedOverview = await OverviewStorage.getStoredOverview(
      candidate,
      state,
      office,
      district,
    );

    if (cachedOverview) {
      log(`Returning cached overview for ${candidate}`);
      return new Response(cachedOverview, {
        headers: { "Content-Type": "text/markdown" },
      });
    }

    // 2. Fetch Legislative Data (if incumbent)
    let legislativeSummary = "";
    if (bioguideId && bioguideId !== "null" && bioguideId !== "undefined") {
      log(`Fetching legislative data for ${bioguideId}...`);
      try {
        // Parallel fetch for speed
        const [sponsorships, cosponsorships] = await Promise.all([
          getMemberSponsoredLegislation(bioguideId),
          getMemberCosponsoredLegislation(bioguideId),
        ]);

        if (sponsorships || cosponsorships) {
          log("Running Legislative Analyst...");
          const analyst = await getLegislativeAnalyst(
            candidate,
            sponsorships || [],
            cosponsorships || [],
          );

          // Use chat() as Agent buffers the stream internally anyway
          const result = await analyst.chat("Analyze this legislative data.");
          legislativeSummary = result.text || "";
          log("Legislative Analysis Complete.");
        }
      } catch (e) {
        log(`Error fetching legislative data: ${e}`);
      }
    }

    // 3. Run Main Research Agent
    log(`Starting research agent for ${candidate}...`);
    const agent = await getCandidateResearchAgent(
      candidate,
      state,
      office,
      legislativeSummary,
      district,
    );

    // 4. Generate Report (Blocking due to Agent limitation)
    const result = await agent.chat("Begin research.");
    const fullText = result.text;

    // 5. Save to Cache
    try {
      if (fullText.length > 100) {
        await OverviewStorage.saveOverview(
          candidate,
          state,
          office,
          district,
          fullText,
        );
        log(`Saved overview cache for ${candidate}`);
      }
    } catch (e) {
      log(`Failed to save overview cache: ${e}`);
    }

    return new Response(fullText, {
      headers: { "Content-Type": "text/markdown" },
    });
  });

  router.register("GET", "/user/district/:zip", async (req) => {
    const zip = req.params.zip!;
    const geocodioKey = getApiKey("GEOCODIO_API_KEY");
    const res = await fetch(
      `https://api.geocod.io/v1.9/geocode?q=${zip}&fields=cd&api_key=${geocodioKey}`,
    );
    const data: any = await res.json();
    if (!data?.results) return new Response("", { status: 404 });
    const districtData = {
      state: data.results[0]?.address_components.state,
      district:
        data.results[0]?.fields.congressional_districts[0]?.district_number,
      current:
        data.results[0]?.fields.congressional_districts[0]?.current_legislators,
    };
    return new Response(JSON.stringify(districtData), {
      headers: { "Content-Type": "application/json" },
    });
  });

  updateOutput("log", "Be Informed plugin loaded. Endpoints registered.");

  return {
    name: "informed",
    description: "Be Informed Plugin",
    usage: "/informed <subcommand>",
    subcommands: [
      {
        name: "start",
        description:
          "Starts the Be Informed plugin (Deprecated - happens on load)",
        usage: "/informed start",
        action: async () => {
          await init();
          updateOutput(
            "log",
            "Be Informed initialized (endpoints are now registered on load).",
          );
        },
      },
      {
        name: "init",
        description: "Initialize the plugin",
        usage: "/informed init",
        action: async () => {
          await init(true);
        },
      },
      {
        name: "auth-gov-data",
        description: "Authenticate with GovData",
        usage: "/informed auth-gov-data <api_key>",
        action: async (args: string[]) => {
          await authGovData(args);
        },
      },
      {
        name: "auth-openfec",
        description: "Authenticate with OpenFEC",
        usage: "/informed auth-openfec <api_key>",
        action: async (args: string[]) => {
          await authOpenFEC(args);
        },
      },
    ],
  };
};

export default plugin;
