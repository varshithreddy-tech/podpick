import { q, q1 } from "./db";
import { geminiJson } from "./gemini";

const SYSTEM = `You write a short taste summary for a personal content recommender.
Describe, in at most 80 words and plain English, what this person likes and dislikes, using ONLY the rated items given (and the previous summary as a starting point). Mention topics, formats, speakers or styles, and lengths only if the data shows a pattern. Do not invent preferences the data does not support.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

/**
 * Rewrites a person's taste summary from their last ~30 rated items. Called after every 5 new ratings.
 * On any Gemini failure the old summary stays and the counter is left alone, so it retries on the next rating.
 */
export async function updateTasteSummary(profileId: number): Promise<boolean> {
  const rated = await q<{ title: string; source_name: string; summary: string | null; topic_tags: string[]; mood_tags: string[]; duration_sec: number | null; value: string }>(
    `select ci.title, ci.source_name, ci.summary, ci.topic_tags, ci.mood_tags, ci.duration_sec, f.value
     from feedback f join content_items ci on ci.id = f.item_id
     where f.profile_id = $1 and f.value in ('love', 'dislike')
     order by f.created_at desc limit 30`,
    [profileId],
  );
  if (!rated.length) return false;
  const prev = await q1<{ summary: string }>("select summary from taste_summaries where profile_id = $1", [profileId]);

  try {
    const { summary } = await geminiJson<{ summary: string }>(
      SYSTEM,
      JSON.stringify({
        previous_summary: prev?.summary ?? null,
        rated_items: rated.map((r) => ({
          rating: r.value === "love" ? "loved" : "disliked",
          title: r.title,
          source: r.source_name,
          about: r.summary,
          topics: r.topic_tags,
          moods: r.mood_tags,
          minutes: r.duration_sec ? Math.round(r.duration_sec / 60) : null,
        })),
      }),
      SCHEMA,
    );
    const clean = summary.trim().slice(0, 700);
    if (!clean) return false;
    await q(
      `insert into taste_summaries (profile_id, summary, updated_at) values ($1, $2, now())
       on conflict (profile_id) do update set summary = excluded.summary, updated_at = now()`,
      [profileId, clean],
    );
    await q("update profiles set ratings_since_summary = 0 where id = $1", [profileId]);
    return true;
  } catch (e) {
    console.error("Taste summary failed", e);
    return false;
  }
}
