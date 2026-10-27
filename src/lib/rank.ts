import { q } from "./db";
import { MAX_PICKS, MIN_SCORE, SOURCE_PENALTY } from "./config";
import { geminiJson } from "./gemini";
import type { Item, Participant } from "./library";

const MAX_CANDIDATES = 40;

const SYSTEM = `You rank real content for a personal recommender. Score ONLY the candidates provided. Never add, rename, or invent items; refer to each by the given id.
Judge each candidate on its own quality and fit, not on how familiar its source or format is.
For each participant give a score from 0 to 10 for how well the candidate fits what they want right now (mood, topic, time) and their taste, with a one-line reason. 6+ means a strong match; do not be generous.
Do not apply any penalty for disliked sources: that is handled separately in code.
If there is more than one participant, also give "combined_reason": one line on why it fits (or fails to fit) both people.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          scores: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { profile_id: { type: "string" }, score: { type: "number" }, reason: { type: "string" } },
              required: ["profile_id", "score", "reason"],
            },
          },
          combined_reason: { type: "string" },
        },
        required: ["id", "scores", "combined_reason"],
      },
    },
  },
  required: ["results"],
};

export type Pick = {
  item: Item;
  rank: number;
  scores: Record<string, { raw: number; penalty: number; final: number; reason: string }>;
  combined: number;
  reason: string;
};

export type RankResult = { picks: Pick[]; bestPerPerson: Record<string, Pick | null>; scoredCount: number };

/** dislikes >= 3 AND dislikes > loves from one source => fixed -2 for that person. One dislike never counts. */
export async function sourcePenalties(profileId: number): Promise<Map<number, number>> {
  const rows = await q<{ source_id: number; loves: number; dislikes: number }>(
    `select ci.source_id,
            count(*) filter (where f.value = 'love')::int as loves,
            count(*) filter (where f.value = 'dislike')::int as dislikes
     from feedback f join content_items ci on ci.id = f.item_id
     where f.profile_id = $1 and f.value in ('love','dislike') group by ci.source_id`,
    [profileId],
  );
  const m = new Map<number, number>();
  for (const r of rows) if (r.dislikes >= 3 && r.dislikes > r.loves) m.set(r.source_id, SOURCE_PENALTY);
  return m;
}

async function context(p: Participant) {
  const taste = await q<{ summary: string }>("select summary from taste_summaries where profile_id = $1", [p.profileId]);
  const recent = await q<{ title: string; value: string }>(
    `select ci.title, f.value from feedback f join content_items ci on ci.id = f.item_id
     where f.profile_id = $1 and f.value in ('love','dislike') order by f.created_at desc limit 16`,
    [p.profileId],
  );
  return {
    profile_id: String(p.profileId),
    name: p.name,
    taste_summary: taste[0]?.summary ?? "No history yet.",
    recent_loves: recent.filter((r) => r.value === "love").slice(0, 8).map((r) => r.title),
    recent_dislikes: recent.filter((r) => r.value === "dislike").slice(0, 8).map((r) => r.title),
    wants_now: { mood: p.mood ?? "Any", topic: p.topic ?? "Any", time: p.timeKey ?? "Any" },
  };
}

/** Gemini STEP 2 + code rules. Throws if Gemini fails twice: nothing unranked is ever shown. */
export async function rankItems(candidates: Item[], participants: Participant[]): Promise<RankResult> {
  if (!candidates.length) return { picks: [], bestPerPerson: {}, scoredCount: 0 };

  // Pre-trim to the most relevant 40 so the prompt stays small: topic/mood matches first, then popularity.
  const wantTopics = new Set(participants.map((p) => p.topic).filter(Boolean));
  const wantMoods = new Set(participants.map((p) => p.mood).filter(Boolean));
  const pre = candidates
    .map((c) => ({
      c,
      s: (c.topic_tags.some((t) => wantTopics.has(t)) ? 2 : 0) + (c.mood_tags.some((m) => wantMoods.has(m)) ? 1 : 0),
    }))
    .sort((a, b) => b.s - a.s || (b.c.views ?? 0) - (a.c.views ?? 0))
    .slice(0, MAX_CANDIDATES)
    .map((x) => x.c);

  const ctx = await Promise.all(participants.map(context));
  const prompt = JSON.stringify({
    participants: ctx,
    candidates: pre.map((c) => ({
      id: String(c.id),
      type: c.format,
      title: c.title,
      source: c.source_name,
      minutes: c.duration_sec ? Math.round(c.duration_sec / 60) : c.read_min,
      summary: c.summary,
      topics: c.topic_tags,
      moods: c.mood_tags,
    })),
  });
  const { results } = await geminiJson<{
    results: { id: string; scores: { profile_id: string; score: number; reason: string }[]; combined_reason?: string }[];
  }>(SYSTEM, prompt, SCHEMA);

  const byId = new Map(pre.map((c) => [String(c.id), c]));
  const penalties = new Map(await Promise.all(participants.map(async (p) => [p.profileId, await sourcePenalties(p.profileId)] as const)));

  const scored: Pick[] = [];
  for (const r of results) {
    const item = byId.get(String(r.id));
    if (!item) continue; // Gemini may only rank what we sent
    const scores: Pick["scores"] = {};
    for (const p of participants) {
      const s = r.scores.find((x) => x.profile_id === String(p.profileId));
      if (!s) continue;
      const raw = Math.max(0, Math.min(10, Number(s.score) || 0));
      const penalty = penalties.get(p.profileId)?.get(item.source_id) ?? 0;
      scores[String(p.profileId)] = { raw, penalty, final: Math.max(0, raw - penalty), reason: s.reason };
    }
    if (Object.keys(scores).length !== participants.length) continue;
    const finals = Object.values(scores).map((s) => s.final);
    const combined = Math.min(...finals); // together: least unhappy
    const lowest = Object.values(scores).find((s) => s.final === combined)!;
    const reason = participants.length > 1 ? r.combined_reason || lowest.reason : lowest.reason;
    scored.push({ item, rank: 0, scores, combined, reason });
  }

  scored.sort((a, b) => b.combined - a.combined || (b.item.views ?? 0) - (a.item.views ?? 0));
  const picks = scored.filter((s) => s.combined >= MIN_SCORE).slice(0, MAX_PICKS);
  picks.forEach((p, i) => (p.rank = i + 1));

  const bestPerPerson: RankResult["bestPerPerson"] = {};
  for (const p of participants) {
    const best = [...scored].sort((a, b) => b.scores[String(p.profileId)].final - a.scores[String(p.profileId)].final)[0];
    bestPerPerson[String(p.profileId)] = best && best.scores[String(p.profileId)].final >= MIN_SCORE ? { ...best, rank: 1 } : null;
  }
  return { picks, bestPerPerson, scoredCount: scored.length };
}
