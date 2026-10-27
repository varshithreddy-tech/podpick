import { env } from "../config";
import { HttpError } from "../config";
import { recordUsage, youtubeBudget, youtubeUnitsToday } from "../usage";

const BASE = "https://www.googleapis.com/youtube/v3";

export class QuotaError extends Error {}

/** One YouTube API call. Refuses to run if it would pass YOUTUBE_DAILY_UNIT_BUDGET. */
async function yt(path: string, params: Record<string, string>, units: number) {
  if ((await youtubeUnitsToday()) + units > youtubeBudget()) {
    throw new QuotaError("YouTube limit reached today");
  }
  const url = `${BASE}/${path}?${new URLSearchParams({ ...params, key: env("YOUTUBE_API_KEY") })}`;
  const res = await fetch(url);
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new QuotaError("YouTube limit reached today");
    throw new Error(`YouTube 403: ${body?.error?.message ?? ""}`);
  }
  if (!res.ok) throw new Error(`YouTube ${res.status}: ${(await res.text()).slice(0, 200)}`);
  await recordUsage("youtube", { units, calls: 1 });
  return res.json();
}

export type YtVideo = {
  id: string;
  url: string;
  title: string;
  description: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  durationSec: number;
  views: number;
  publishedAt: string;
  hintLanguage: string | null;
};

export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

/** videos.list: 1 unit per 50 ids. Skips live/upcoming broadcasts. */
export async function videoDetails(ids: string[]): Promise<YtVideo[]> {
  const out: YtVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await yt("videos", { part: "snippet,contentDetails,statistics", id: ids.slice(i, i + 50).join(",") }, 1);
    for (const v of data.items ?? []) {
      if (v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") continue;
      out.push({
        id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.snippet.title,
        description: v.snippet.description ?? "",
        thumbnail: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        channelId: v.snippet.channelId,
        channelTitle: v.snippet.channelTitle,
        durationSec: parseDuration(v.contentDetails?.duration ?? ""),
        views: Number(v.statistics?.viewCount ?? 0),
        publishedAt: v.snippet.publishedAt,
        hintLanguage: v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage ?? null,
      });
    }
  }
  return out;
}

/** Cheap: a channel's uploads playlist (1 unit per page of 50) + details (1 unit per 50). */
export async function channelUploads(channelId: string, pages = 2): Promise<YtVideo[]> {
  const playlist = "UU" + channelId.slice(2);
  const ids: string[] = [];
  let pageToken = "";
  for (let p = 0; p < pages; p++) {
    const data = await yt("playlistItems", { part: "contentDetails", playlistId: playlist, maxResults: "50", ...(pageToken && { pageToken }) }, 1);
    for (const it of data.items ?? []) ids.push(it.contentDetails.videoId);
    pageToken = data.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return ids.length ? videoDetails(ids) : [];
}

/** Discovery search: ~100 units. Long videos only (YouTube's own >20 min bucket). */
export async function searchVideos(query: string, order: "relevance" | "viewCount"): Promise<YtVideo[]> {
  const data = await yt(
    "search",
    { part: "snippet", type: "video", videoDuration: "long", maxResults: "50", q: query, order },
    100,
  );
  const ids = (data.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
  return ids.length ? videoDetails(ids) : [];
}

export type YtChannel = { channelId: string; title: string; thumbnail: string; handle?: string };

/** Setup: find channels by name (100 units). */
export async function searchChannels(query: string): Promise<YtChannel[]> {
  const data = await yt("search", { part: "snippet", type: "channel", maxResults: "4", q: query }, 100);
  return (data.items ?? []).map((i: any) => ({
    channelId: i.snippet.channelId ?? i.id.channelId,
    title: i.snippet.channelTitle ?? i.snippet.title,
    thumbnail: i.snippet.thumbnails?.default?.url ?? "",
  }));
}

/** "Add by pasting a link": accepts @handle, /channel/UC..., /c/ or /user/ URLs, or a video link (uses its channel). */
export async function channelFromLink(link: string): Promise<YtChannel> {
  let u: URL;
  try {
    u = new URL(link.startsWith("http") ? link : `https://${link}`);
  } catch {
    throw new HttpError(400, "That doesn't look like a link");
  }
  const parts = u.pathname.split("/").filter(Boolean);
  let params: Record<string, string> | null = null;

  const chIdx = parts.indexOf("channel");
  if (chIdx >= 0 && parts[chIdx + 1]) params = { id: parts[chIdx + 1] };
  else if (parts[0]?.startsWith("@")) params = { forHandle: parts[0] };
  else if (parts[0] === "user" && parts[1]) params = { forUsername: parts[1] };
  else {
    const vid = u.hostname.includes("youtu.be") ? parts[0] : u.searchParams.get("v");
    if (vid) {
      const v = await yt("videos", { part: "snippet", id: vid }, 1);
      const cid = v.items?.[0]?.snippet?.channelId;
      if (cid) params = { id: cid };
    }
  }
  if (!params) throw new HttpError(400, "Paste a YouTube channel (@handle or /channel/...) or video link");
  const data = await yt("channels", { part: "snippet", ...params }, 1);
  const c = data.items?.[0];
  if (!c) throw new HttpError(404, "Channel not found");
  return {
    channelId: c.id,
    title: c.snippet.title,
    thumbnail: c.snippet.thumbnails?.default?.url ?? "",
    handle: c.snippet.customUrl,
  };
}
