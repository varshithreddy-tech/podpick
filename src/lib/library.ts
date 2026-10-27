import { q, q1 } from "./db";
import {
  LIBRARY_TARGET, MIN_FULL_LENGTH_SEC, MOOD_QUERIES, TIME_SLOTS, TOPIC_QUERIES, slotByKey,
} from "./config";
import { QuotaError, channelUploads, searchVideos, type YtVideo } from "./sources/youtube";

export type Participant = {
  profileId: number;
  name: string;
  mood: string | null;
  topic: string | null;
  timeKey: string | null;
};

export type Item = {
  id: number;
  format: "watch" | "listen" | "read";
  url: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  source_id: number;
  source_name: string;
  duration_sec: number | null;
  read_min: number | null;
  views: number | null;
  published_at: string | null;
  hint_language: string | null;
  is_quality: boolean | null;
  check_reason: string | null;
  language: string | null;
  topic_tags: string[];
  mood_tags: string[];
  summary: string | null;
  paywalled?: boolean;
  we_subscribe?: boolean;
};

export async function getTopics(): Promise<string[]> {
  const r = await q1<{ value: string[] }>("select value from settings where key = 'topics'");
  return r?.value ?? [];
}

/** Together mode uses the shorter of the two time limits; "Any" imposes no limit. */
export function effectiveSlot(participants: Participant[]) {
  const slots = participants.map((p) => slotByKey(p.timeKey)).filter(Boolean) as (typeof TIME_SLOTS)[number][];
  if (!slots.length) return { min: MIN_FULL_LENGTH_SEC, max: 1_000_000, key: null as string | null };
  const s = slots.reduce((a, b) => (b.max < a.max ? b : a));
  return { min: s.min, max: s.max, key: s.key as string };
}

export type Filters = {
  format: string; // 'any' | 'watch' | 'listen' | 'read'
  participants: Participant[];
};

/**
 * HARD FILTERS, in code, before any ranking: format, length/time slot, language, passed the
 * Gemini item check, source enabled (paywalled only if "We subscribe"), never-repeat.
 * Topic and mood narrow the pool only when every participant picked one.
 */
export async function eligibleItems(f: Filters, opts: { applyMood?: boolean; limit?: number } = {}): Promise<Item[]> {
  const slot = effectiveSlot(f.participants);
  const readMin = slot.key === "u30" || slot.key === null ? 0 : Math.floor(slot.min / 60);
  const readMax = Math.ceil(slot.max / 60);
  const profileIds = f.participants.map((p) => p.profileId);
  const topics = f.participants.map((p) => p.topic);
  const moods = f.participants.map((p) => p.mood);

  const params: unknown[] = [];
  const add = (v: unknown) => (params.push(v), `$${params.length}`);

  const where: string[] = [
    "ci.is_quality = true",
    "ci.language in ('en','hi')",
    "s.enabled and (not s.paywalled or s.we_subscribe)",
  ];
  if (f.format !== "any") where.push(`ci.format = ${add(f.format)}`);

  const dMin = add(slot.min), dMax = add(slot.max), rMin = add(readMin), rMax = add(readMax);
  where.push(
    `((ci.format in ('watch','listen') and ci.duration_sec >= ${dMin} and ci.duration_sec >= ${MIN_FULL_LENGTH_SEC} and ci.duration_sec < ${dMax})
      or (ci.format = 'read' and ci.read_min >= ${rMin} and ci.read_min < ${rMax}))`,
  );

  if (topics.every((t) => t)) where.push(`ci.topic_tags && ${add(topics)}::text[]`);
  if (opts.applyMood && moods.every((m) => m)) where.push(`ci.mood_tags && ${add(moods)}::text[]`);

  where.push(`not exists (
    select 1 from unnest(${add(profileIds)}::int[]) as pid
    where exists (select 1 from feedback f where f.profile_id = pid and f.item_id = ci.id and f.value in ('love','dislike'))
       or (exists (select 1 from recommendations r join session_participants sp on sp.session_id = r.session_id
                   where r.item_id = ci.id and sp.profile_id = pid)
           and not exists (select 1 from feedback f where f.profile_id = pid and f.item_id = ci.id and f.value = 'save'))
  )`);

  const order = "order by coalesce(ci.views, 0) desc";
  const limit = opts.limit ? `limit ${Number(opts.limit)}` : "";
  return q<Item>(`select ci.*, s.paywalled, s.we_subscribe from content_items ci join sources s on s.id = ci.source_id where ${where.join(" and ")} ${order} ${limit}`, params);
}

export async function needsFetch(f: Filters): Promise<boolean> {
  const n = (await eligibleItems(f, { applyMood: true })).length;
  return n < LIBRARY_TARGET;
}

// ---- Saving to the library ----

export async function upsertVideos(videos: YtVideo[]) {
  if (!videos.length) return;
  const channels = new Map(videos.map((v) => [v.channelId, v.channelTitle]));
  const srcRows = await q<{ id: number; external_id: string }>(
    `insert into sources (kind, external_id, name, url)
     select 'youtube_channel', t.ext, t.name, 'https://www.youtube.com/channel/' || t.ext
     from unnest($1::text[], $2::text[]) as t(ext, name)
     on conflict (kind, external_id) do update set name = excluded.name
     returning id, external_id`,
    [[...channels.keys()], [...channels.values()]],
  );
  const srcId = new Map(srcRows.map((r) => [r.external_id, r.id]));

  await q(
    `insert into content_items
       (format, external_id, url, title, description, thumbnail, source_id, source_name, duration_sec, views, published_at, hint_language)
     select 'watch', t.ext, t.url, t.title, t.descr, t.thumb, t.sid, t.sname, t.dur, t.views, t.pub, t.hint
     from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::text[], $8::int[], $9::bigint[], $10::timestamptz[], $11::text[])
       as t(ext, url, title, descr, thumb, sid, sname, dur, views, pub, hint)
     on conflict (url) do update set views = excluded.views, thumbnail = excluded.thumbnail`,
    [
      videos.map((v) => v.id),
      videos.map((v) => v.url),
      videos.map((v) => v.title),
      videos.map((v) => v.description.slice(0, 2000)),
      videos.map((v) => v.thumbnail),
      videos.map((v) => srcId.get(v.channelId)!),
      videos.map((v) => v.channelTitle),
      videos.map((v) => v.durationSec),
      videos.map((v) => v.views),
      videos.map((v) => v.publishedAt),
      videos.map((v) => v.hintLanguage ?? ""),
    ],
  );
}

// ---- Fetching from YouTube (only when the library is thin) ----

function searchQueriesFor(topics: (string | null)[], moods: (string | null)[]): string[] {
  const out = new Set<string>();
  const named = topics.filter(Boolean) as string[];
  if (named.length) {
    for (const t of named) {
      const base = TOPIC_QUERIES[t] ?? [`${t} podcast`];
      base.forEach((b) => out.add(b));
      out.add(`${base[0]} hindi`);
    }
  } else {
    const mq = moods.filter(Boolean).map((m) => MOOD_QUERIES[m as string]).filter(Boolean);
    if (mq.length) mq.forEach((m) => out.add(m));
    else Object.values(TOPIC_QUERIES).forEach((qs) => out.add(qs[0]));
  }
  return [...out];
}

export async function fetchFromYouTube(f: Filters): Promise<string[]> {
  const notes: string[] = [];
  try {
    // 1. Starter channels' uploads (cheap), refreshed at most once a day.
    const stale = await q<{ id: number; external_id: string; name: string }>(
      `select distinct s.id, s.external_id, s.name from sources s
       join profile_sources ps on ps.source_id = s.id
       where ps.profile_id = any($1::int[]) and s.kind = 'youtube_channel' and s.enabled
         and (s.last_checked_at is null or s.last_checked_at < date_trunc('day', now()))`,
      [f.participants.map((p) => p.profileId)],
    );
    for (const ch of stale) {
      await upsertVideos(await channelUploads(ch.external_id, 2));
      await q("update sources set last_checked_at = now() where id = $1", [ch.id]);
    }

    // 2. Discovery search (~100 units each): the 2 least-recently-run queries for this ask.
    const keys = searchQueriesFor(f.participants.map((p) => p.topic), f.participants.map((p) => p.mood))
      .flatMap((query) => (["relevance", "viewCount"] as const).map((order) => ({ query, order })));
    const ran = await q<{ key: string; ran_at: string }>(
      "select key, max(ran_at) as ran_at from fetch_log where kind = 'yt_search' group by key",
    );
    const lastRun = new Map(ran.map((r) => [r.key, new Date(r.ran_at).getTime()]));
    const cutoff = Date.now() - 12 * 3600 * 1000;
    const due = keys
      .map((k) => ({ ...k, key: `${k.query}|${k.order}`, last: lastRun.get(`${k.query}|${k.order}`) ?? 0 }))
      .filter((k) => k.last < cutoff)
      .sort((a, b) => a.last - b.last)
      .slice(0, 2);
    for (const k of due) {
      const vids = await searchVideos(k.query, k.order);
      await upsertVideos(vids);
      await q("insert into fetch_log (kind, key, result_count) values ('yt_search', $1, $2)", [k.key, vids.length]);
    }
  } catch (e) {
    if (e instanceof QuotaError) notes.push("YouTube limit reached today, showing saved library");
    else {
      console.error("YouTube fetch failed", e);
      notes.push("YouTube is having trouble right now, showing saved library");
    }
  }
  return notes;
}
