import { q } from "./db";
import { MIN_FULL_LENGTH_SEC, MOODS } from "./config";
import { geminiJson } from "./gemini";
import { getTopics } from "./library";

const BATCH = 25;
const MAX_PER_ASK = 75;

const SYSTEM = `You check items for a personal content recommender. You judge ONLY from the metadata given (title, description, channel or publication, length). Never invent content you cannot see in the metadata.
For each item decide:
- is_quality: true only for a real podcast, long-form conversation/interview, or quality long-form article. False for lectures, vlogs, compilations, highlight reels, clips, trailers, news briefs, SEO pages, press releases, livestream recordings with no substance, music, or sales content.
- reason: one short line explaining the decision.
- language: "en" for English, "hi" for Hindi (including Hinglish), otherwise "other".
- topics: zero or more tags chosen ONLY from the allowed topic list.
- moods: zero or more tags chosen ONLY from the allowed mood list.
- summary: one plain-English line saying what the item is about, using only the metadata.
Return one result per input item, using the same id.`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "STRING" },
      is_quality: { type: "BOOLEAN" },
      reason: { type: "STRING" },
      language: { type: "STRING" },
      topics: { type: "ARRAY", items: { type: "STRING" } },
      moods: { type: "ARRAY", items: { type: "STRING" } },
      summary: { type: "STRING" },
    },
    required: ["id", "is_quality", "reason", "language", "topics", "moods", "summary"],
  },
};

type Row = {
  id: number; title: string; description: string | null; source_name: string;
  duration_sec: number | null; hint_language: string | null; format: string;
};
type Result = {
  id: string; is_quality: boolean; reason: string; language: string;
  topics: string[]; moods: string[]; summary: string;
};

/**
 * Gemini STEP 1: check each new item once and store the result on it.
 * Items under 20 minutes are rejected by code and never sent to Gemini.
 * Returns how many items could not be checked (Gemini failed twice); those stay unchecked and are never shown.
 */
export async function checkNewItems(): Promise<{ checked: number; failed: number }> {
  await q(
    `update content_items set is_quality = false, check_reason = 'Under 20 minutes', checked_at = now()
     where checked_at is null and format in ('watch','listen') and coalesce(duration_sec, 0) < ${MIN_FULL_LENGTH_SEC}`,
  );
  const rows = await q<Row>(
    `select id, title, description, source_name, duration_sec, hint_language, format
     from content_items where checked_at is null order by coalesce(views, 0) desc limit ${MAX_PER_ASK}`,
  );
  if (!rows.length) return { checked: 0, failed: 0 };

  const topics = await getTopics();
  const batches: Row[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));

  let checked = 0, failed = 0;
  await Promise.all(
    batches.map(async (batch) => {
      const prompt = JSON.stringify({
        allowed_topics: topics,
        allowed_moods: MOODS,
        items: batch.map((r) => ({
          id: String(r.id),
          type: r.format,
          title: r.title,
          source: r.source_name,
          minutes: r.duration_sec ? Math.round(r.duration_sec / 60) : null,
          language_hint: r.hint_language || null,
          description: (r.description ?? "").slice(0, 600),
        })),
      });
      try {
        const results = await geminiJson<Result[]>(SYSTEM, prompt, SCHEMA);
        const valid = new Set(batch.map((r) => String(r.id)));
        const clean = results
          .filter((r) => valid.has(String(r.id)))
          .map((r) => ({
            id: Number(r.id),
            is_quality: !!r.is_quality,
            reason: String(r.reason ?? "").slice(0, 300),
            language: r.language === "en" || r.language === "hi" ? r.language : "other",
            topics: (r.topics ?? []).filter((t) => topics.includes(t)),
            moods: (r.moods ?? []).filter((m) => (MOODS as readonly string[]).includes(m)),
            summary: String(r.summary ?? "").slice(0, 300),
          }));
        if (clean.length) {
          await q(
            `update content_items ci set is_quality = x.is_quality, check_reason = x.reason, language = x.language,
               topic_tags = x.topics, mood_tags = x.moods, summary = x.summary, checked_at = now()
             from jsonb_to_recordset($1::jsonb) as x(id bigint, is_quality boolean, reason text, language text, topics text[], moods text[], summary text)
             where ci.id = x.id`,
            [JSON.stringify(clean)],
          );
        }
        checked += clean.length;
        failed += batch.length - clean.length;
      } catch (e) {
        console.error("Item check failed", e);
        failed += batch.length;
      }
    }),
  );
  return { checked, failed };
}
