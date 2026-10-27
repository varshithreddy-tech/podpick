import { LIBRARY_TARGET } from "./config";
import { q } from "./db";
import {
  dueKeys, eligibleItems, fetchFromYouTube, logFetch, searchQueriesFor, upsertItems, type Filters,
} from "./library";
import { NotConfigured, searchItunes, searchPodcastIndex, type NewItem } from "./sources/podcasts";
import { TavilyQuota, tavilySearch } from "./sources/tavily";

type Fmt = "watch" | "listen" | "read";

const READ_TERMS: Record<string, string> = {
  "Startup growth stories": "startup founder growth story India",
  "Pharma retail industry": "pharmacy retail India",
  "Personality development / self-improvement": "self improvement personal development",
  Communication: "communication skills",
};
const TRANSCRIPT_QUERIES = [
  "MedPlus Health Services earnings call transcript",
  "Apollo HealthCo earnings call transcript",
  "Apollo Hospitals earnings call transcript",
  "Wellness Forever Medicare earnings call transcript",
];
const EXCLUDE = ["youtube.com", "reddit.com", "quora.com", "facebook.com", "linkedin.com", "pinterest.com"];

/**
 * Library first: fetch from live sources only when there are fewer than about 30 eligible candidates
 * (for "Any" format, about 10 per format so every format gets a fair chance). Returns user-facing notes.
 * A failing source never stops the others.
 */
export async function refreshLibrary(f: Filters): Promise<string[]> {
  const formats: Fmt[] = f.format === "any" ? ["watch", "listen", "read"] : [f.format as Fmt];
  const target = f.format === "any" ? Math.ceil(LIBRARY_TARGET / 3) : LIBRARY_TARGET;

  const jobs: Promise<string[]>[] = [];
  for (const fmt of formats) {
    const count = (await eligibleItems({ ...f, format: fmt }, { applyMood: true })).length;
    if (count >= target) continue;
    const ff = { ...f, format: fmt };
    jobs.push(fmt === "watch" ? fetchFromYouTube(ff) : fmt === "listen" ? fetchPodcasts(ff) : fetchReading(ff));
  }
  return (await Promise.all(jobs)).flat();
}

async function fetchPodcasts(f: Filters): Promise<string[]> {
  const topics = f.participants.map((p) => p.topic);
  const queries = searchQueriesFor(topics, f.participants.map((p) => p.mood));
  if (topics.some((t) => t && /pharma/i.test(t))) queries.push("PharmaVoice", "pharma retail podcast");
  const notes: string[] = [];
  let piBroken = false;
  let anyOk = false;

  for (const query of await dueKeys("listen_search", queries, 2)) {
    let items: NewItem[] = [];
    try {
      items = await searchPodcastIndex(query);
      anyOk = true;
    } catch (e) {
      if (!(e instanceof NotConfigured)) {
        console.error("Podcast Index failed", e);
        piBroken = true;
      }
    }
    if (!items.length) {
      try {
        items = await searchItunes(query);
        anyOk = true;
      } catch (e) {
        console.error("iTunes failed", e);
      }
    }
    await upsertItems("listen", items);
    if (items.length) await logFetch("listen_search", query, items.length);
  }
  if (piBroken) notes.push("Podcast Index is having trouble, used Apple Podcasts instead");
  if (!anyOk) notes.push("Podcasts are unavailable right now, showing saved library");
  return notes;
}

async function fetchReading(f: Filters): Promise<string[]> {
  const topics = f.participants.map((p) => p.topic);
  const named = topics.filter(Boolean) as string[];
  const terms = [...new Set((named.length ? named : Object.keys(READ_TERMS)).map((t) => READ_TERMS[t] ?? t))];

  type Job = { key: string; query: string; kind: "publication" | "transcript_site"; domains?: string[]; exclude?: string[] };
  const jobs = new Map<string, Job>();

  // Paywalled publications only when "We subscribe" is on (The Ken is; The Morning Context is not by default).
  const subscribed = await q<{ external_id: string }>(
    `select external_id from sources where kind = 'publication' and paywalled and enabled and we_subscribe and external_id is not null`,
  );
  for (const term of terms) {
    for (const s of subscribed) jobs.set(`${s.external_id}|${term}`, { key: `${s.external_id}|${term}`, query: term, kind: "publication", domains: [s.external_id] });
    jobs.set(`lf|${term}`, { key: `lf|${term}`, query: `${term} in-depth long-form article analysis`, kind: "publication", exclude: EXCLUDE });
  }
  if (!named.length || named.some((t) => /pharma/i.test(t))) {
    for (const t of TRANSCRIPT_QUERIES) jobs.set(`tr|${t}`, { key: `tr|${t}`, query: t, kind: "transcript_site", exclude: EXCLUDE });
  }

  const notes: string[] = [];
  for (const key of await dueKeys("read_search", [...jobs.keys()], 2)) {
    const job = jobs.get(key)!;
    try {
      const items = await tavilySearch(job.query, job.kind, { domains: job.domains, excludeDomains: job.exclude });
      await upsertItems("read", items);
      await logFetch("read_search", key, items.length);
    } catch (e) {
      if (e instanceof TavilyQuota) notes.push("Tavily credits used up, showing saved articles");
      else if (e instanceof NotConfigured) notes.push("Articles are off until a Tavily key is added, showing saved library");
      else {
        console.error("Tavily failed", e);
        notes.push("Article search is having trouble, showing saved library");
      }
      break;
    }
  }
  return [...new Set(notes)];
}
