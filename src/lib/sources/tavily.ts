import { recordUsage, tavilyBudget, tavilyCreditsThisMonth } from "../usage";
import { NotConfigured, type NewItem } from "./podcasts";

export class TavilyQuota extends Error {}

type TavilyResult = { title: string; url: string; content: string; published_date?: string };

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function mapTavilyResult(r: TavilyResult, kind: "publication" | "transcript_site"): NewItem | null {
  const domain = domainOf(r.url);
  if (!domain || !r.title) return null;
  const isKen = domain.endsWith("the-ken.com");
  return {
    externalId: null,
    url: r.url,
    title: r.title,
    description: (r.content ?? "").slice(0, 1500),
    thumbnail: null,
    durationSec: null,
    publishedAt: r.published_date ? new Date(r.published_date).toISOString() : null,
    hintLanguage: null,
    sourceKind: kind,
    sourceExt: isKen ? "the-ken.com" : domain,
    sourceName: isKen ? "The Ken" : domain,
    sourceUrl: `https://${isKen ? "the-ken.com" : domain}`,
  };
}

/** One Tavily search = 1 credit (basic depth). Stops at TAVILY_MONTHLY_BUDGET (free tier is 1,000/month). */
export async function tavilySearch(
  query: string,
  kind: "publication" | "transcript_site",
  opts: { domains?: string[]; excludeDomains?: string[] } = {},
): Promise<NewItem[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new NotConfigured("Tavily key is not set");
  if ((await tavilyCreditsThisMonth()) + 1 > tavilyBudget()) throw new TavilyQuota("Tavily credits used up for this month");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 10,
      include_answer: false,
      ...(opts.domains && { include_domains: opts.domains }),
      ...(opts.excludeDomains && { exclude_domains: opts.excludeDomains }),
    }),
  });
  if (res.status === 429 || res.status === 432 || res.status === 433) throw new TavilyQuota("Tavily limit reached");
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  await recordUsage("tavily", { units: 1, calls: 1 });
  const data = await res.json();
  return ((data.results ?? []) as TavilyResult[]).map((r) => mapTavilyResult(r, kind)).filter(Boolean) as NewItem[];
}
