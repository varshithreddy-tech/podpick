import { createHash } from "node:crypto";
import { recordUsage } from "../usage";

/** A podcast episode or article normalised for the library. */
export type NewItem = {
  externalId: string | null;
  url: string;
  title: string;
  description: string;
  thumbnail: string | null;
  durationSec: number | null;
  readMin?: number | null;
  views?: number | null;
  publishedAt: string | null;
  hintLanguage: string | null;
  sourceKind: "podcast" | "publication" | "transcript_site";
  sourceExt: string;
  sourceName: string;
  sourceUrl: string | null;
};

export class NotConfigured extends Error {}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ---- Podcast Index (primary) ----
const PI = "https://api.podcastindex.org/api/1.0";

async function pi(path: string, params: Record<string, string>) {
  const key = process.env.PODCASTINDEX_API_KEY;
  const secret = process.env.PODCASTINDEX_API_SECRET;
  if (!key || !secret) throw new NotConfigured("Podcast Index key is not set");
  const date = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${PI}${path}?${new URLSearchParams(params)}`, {
    headers: {
      "User-Agent": "PodPick/1.0",
      "X-Auth-Key": key,
      "X-Auth-Date": date,
      Authorization: createHash("sha1").update(key + secret + date).digest("hex"),
    },
  });
  if (!res.ok) throw new Error(`Podcast Index ${res.status}`);
  await recordUsage("podcastindex", { calls: 1 });
  return res.json();
}

const okLang = (l?: string) => !l || /^(en|hi)/i.test(l);

export function mapPodcastIndexEpisode(ep: any, feed: any): NewItem | null {
  const url = ep.link || ep.enclosureUrl;
  if (!url || !ep.title) return null;
  return {
    externalId: ep.id != null ? `pi:${ep.id}` : null,
    url,
    title: ep.title,
    description: stripHtml(ep.description ?? "").slice(0, 2000),
    thumbnail: ep.image || ep.feedImage || feed.image || null,
    durationSec: Number(ep.duration) || null,
    publishedAt: ep.datePublished ? new Date(ep.datePublished * 1000).toISOString() : null,
    hintLanguage: feed.language ?? null,
    sourceKind: "podcast",
    sourceExt: `pi:${feed.id}`,
    sourceName: feed.title,
    sourceUrl: feed.link || feed.url || null,
  };
}

export async function searchPodcastIndex(query: string): Promise<NewItem[]> {
  const feeds = ((await pi("/search/byterm", { q: query, max: "8" })).feeds ?? []).filter((f: any) => okLang(f.language)).slice(0, 4);
  const out: NewItem[] = [];
  for (const feed of feeds) {
    const eps = (await pi("/episodes/byfeedid", { id: String(feed.id), max: "15" })).items ?? [];
    for (const ep of eps) {
      const m = mapPodcastIndexEpisode(ep, feed);
      if (m) out.push(m);
    }
  }
  return out;
}

// ---- Apple iTunes Search (fallback, no key) ----
export function mapItunesEpisode(r: any): NewItem | null {
  const url = r.trackViewUrl || r.episodeUrl;
  if (!url || !r.trackName) return null;
  return {
    externalId: r.trackId != null ? `it:${r.trackId}` : null,
    url,
    title: r.trackName,
    description: stripHtml(r.description ?? r.shortDescription ?? "").slice(0, 2000),
    thumbnail: r.artworkUrl600 || r.artworkUrl160 || null,
    durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
    publishedAt: r.releaseDate ?? null,
    hintLanguage: null,
    sourceKind: "podcast",
    sourceExt: `it:${r.collectionId}`,
    sourceName: r.collectionName ?? "Podcast",
    sourceUrl: r.collectionViewUrl ?? null,
  };
}

export async function searchItunes(query: string): Promise<NewItem[]> {
  const res = await fetch(
    `https://itunes.apple.com/search?${new URLSearchParams({ term: query, media: "podcast", entity: "podcastEpisode", limit: "50", country: "IN" })}`,
  );
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  await recordUsage("itunes", { calls: 1 });
  const data = await res.json();
  return (data.results ?? []).map(mapItunesEpisode).filter(Boolean) as NewItem[];
}
