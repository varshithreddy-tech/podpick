import { q, q1 } from "./db";
import { QuotaError, searchVideos } from "./sources/youtube";
import { upsertVideos } from "./library";

const MAX_CLIPS = 3;
const CLIP_MIN_SEC = 30;
const CLIP_MAX_SEC = 15 * 60;
const RETRY_AFTER_DAYS = 7;

export type Clip = {
  id: number;
  url: string;
  title: string;
  thumbnail: string | null;
  duration_sec: number | null;
  source_name: string;
};

const STOP = new Set(["with", "from", "that", "this", "what", "your", "have", "about", "episode", "podcast", "full", "show", "into", "will", "they", "their", "when", "how", "why", "the", "and", "for"]);

export function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

/** Share of the smaller title's words that also appear in the other (0 to 1). */
export function similarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const clipCols = "ci.id, ci.url, ci.title, ci.thumbnail, ci.duration_sec, ci.source_name";

async function cached(itemId: number): Promise<Clip[]> {
  return q<Clip>(
    `select ${clipCols} from item_clips ic join content_items ci on ci.id = ic.clip_id where ic.item_id = $1 order by ic.rank`,
    [itemId],
  );
}

async function attach(itemId: number, clipIds: number[]) {
  if (!clipIds.length) return;
  const have = (await cached(itemId)).length;
  await q(
    `insert into item_clips (item_id, clip_id, rank)
     select $1, t.id, t.r + $3 from unnest($2::bigint[]) with ordinality as t(id, r) on conflict do nothing`,
    [itemId, clipIds, have],
  );
}

/**
 * Short clips and highlights for a suggested episode. Order of work, cheapest first:
 *  1. cached clips for this item,
 *  2. clips already in the library from the same channel whose title matches the episode,
 *  3. one YouTube search (about 100 units), at most once a week per item.
 */
export async function getHighlights(itemId: number): Promise<{ clips: Clip[]; note?: string }> {
  let clips = await cached(itemId);
  if (clips.length >= MAX_CLIPS) return { clips };

  const item = await q1<{ id: number; title: string; source_id: number; source_name: string; format: string; url: string; src_kind: string; src_ext: string | null }>(
    `select ci.id, ci.title, ci.source_id, ci.source_name, ci.format, ci.url, s.kind as src_kind, s.external_id as src_ext
     from content_items ci join sources s on s.id = ci.source_id where ci.id = $1`,
    [itemId],
  );
  if (!item) return { clips: [] };

  // 2. Library match: same channel, short, similar title.
  if (item.format === "watch") {
    const pool = await q<Clip>(
      `select ${clipCols} from content_items ci
       where ci.source_id = $1 and ci.id <> $2 and ci.format = 'watch' and ci.duration_sec between ${CLIP_MIN_SEC} and ${CLIP_MAX_SEC}
         and ci.id not in (select clip_id from item_clips where item_id = $2)`,
      [item.source_id, itemId],
    );
    const picked = pool
      .map((c) => ({ c, s: similarity(item.title, c.title) }))
      .filter((x) => x.s >= 0.34)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_CLIPS - clips.length)
      .map((x) => x.c.id);
    await attach(itemId, picked);
    clips = await cached(itemId);
    if (clips.length >= MAX_CLIPS) return { clips };
  }

  // 3. One YouTube search, at most once every RETRY_AFTER_DAYS per item.
  const recent = await q1(
    `select 1 from fetch_log where kind = 'highlights' and key = $1 and ran_at > now() - interval '${RETRY_AFTER_DAYS} days'`,
    [String(itemId)],
  );
  if (recent) return { clips };

  try {
    const channelId = item.format === "watch" && item.src_kind === "youtube_channel" ? item.src_ext ?? undefined : undefined;
    const own = /[?&]v=([w-]{11})/.exec(item.url)?.[1];
    const want = MAX_CLIPS - clips.length;
    const isClip = (v: { id: string; durationSec: number }) => v.id !== own && v.durationSec >= CLIP_MIN_SEC && v.durationSec <= CLIP_MAX_SEC;

    // Strategy 1: clips on the episode's own channel. Strategy 2 (if that finds nothing): anywhere on YouTube,
    // keeping only clips whose title clearly relates to the episode.
    let found = channelId ? (await searchVideos(item.title, "relevance", "any", channelId)).filter(isClip).slice(0, want) : [];
    if (!found.length) {
      const query = item.format === "watch" ? item.title : `${item.source_name} ${item.title}`;
      found = (await searchVideos(query, "relevance", "any"))
        .filter(isClip)
        .filter((v) => similarity(item.title, v.title) >= 0.3)
        .slice(0, want);
    }
    await upsertVideos(found);
    await q("insert into fetch_log (kind, key, result_count) values ('highlights', $1, $2)", [String(itemId), found.length]);
    if (found.length) {
      const ids = await q<{ id: number }>("select id from content_items where url = any($1::text[])", [found.map((v) => v.url)]);
      await attach(itemId, ids.map((r) => r.id));
    }
    clips = await cached(itemId);
    return { clips, note: clips.length ? undefined : "No highlights found for this one" };
  } catch (e) {
    if (e instanceof QuotaError) return { clips, note: "YouTube limit reached today, showing saved clips only" };
    console.error("Highlights failed", e);
    return { clips, note: "Couldn't look up highlights right now" };
  }
}
