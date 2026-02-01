import { XMLParser } from "fast-xml-parser";
import { getApiKey } from "../utils/keys";

const getGovKey = () => getApiKey("GOV_DATA_API_KEY");

interface SenatorVote {
  member_full: string;
  last_name: string;
  party: string;
  state: string;
  vote_cast: string;
}

async function getSenateVote(
  congress: number,
  session: number,
  voteNum: number,
) {
  // Pad the vote number to 5 digits (e.g., 6 -> "00006")
  const paddedNum = voteNum.toString().padStart(5, "0");

  const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${paddedNum}.xml`;

  try {
    const res = await fetch(url);
    if (res.status === 404) return null; // Vote doesn't exist yet

    const xml = await res.text();
    const parser = new XMLParser();
    const data = parser.parse(xml);

    // 2. Parse the "Messy" XML
    // Structure: <roll_call_vote> <members> <member> ...
    const voteInfo = data.roll_call_vote;
    const members = voteInfo.members.member;

    return {
      question: voteInfo.vote_question_text,
      result: voteInfo.vote_result_text,
      date: voteInfo.vote_date,
      votes: members.map((m: any) => ({
        member_full: `${m.first_name} ${m.last_name}`,
        last_name: m.last_name,
        party: m.party,
        state: m.state,
        vote_cast: m.vote_cast,
      })) as SenatorVote[],
    };
  } catch (err) {
    console.error(`Failed to fetch Senate Vote ${voteNum}:`, err);
    return null;
  }
}

export async function getMemberById(id: string) {
  const url = `https://api.congress.gov/v3/member/${id}?format=json&api_key=${getGovKey()}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (!data?.member) return null;
  return {
    image: data.member?.depiction?.imageUrl,
    terms: data.member?.terms,
    leadership: data.member?.leadership,
    partyHistory: data.member?.partyHistory,
    sponsoredLegislation: data.member?.sponsoredLegislation?.count,
    cosponsoredLegislation: data.member?.cosponsoredLegislation?.count,
  };
}

export async function getMemberSponsoredLegislation(id: string) {
  const url = `https://api.congress.gov/v3/member/${id}/sponsored-legislation?format=json&api_key=${getGovKey()}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (!data?.sponsoredLegislation) return null;
  return data.sponsoredLegislation;
}

export async function getMemberCosponsoredLegislation(id: string) {
  const url = `https://api.congress.gov/v3/member/${id}/cosponsored-legislation?format=json&api_key=${getGovKey()}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (!data?.cosponsoredLegislation) return null;
  return data.cosponsoredLegislation;
}

// Bill Types
// hr	         House Bill	House	Yes	Yes
// s	         Senate Bill	Senate	Yes	Yes

export async function getRelevantBills(congress: number, senate: boolean) {
  const url = `https://api.congress.gov/v3/bill/${congress}/${senate ? "s" : "hr"}?format=json&api_key=${getGovKey()}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  console.log(data);
  if (!data?.bills) return null;
  return data.bills;
}

export async function getBillActions(
  congress: number,
  billType: string,
  billNumber: number,
) {
  const url = `https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}/actions?format=json&api_key=${getGovKey()}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (!data?.actions) return null;
  return data.actions;
}
