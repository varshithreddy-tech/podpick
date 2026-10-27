import { q } from "./db";
import { MIN_DURATION_SEC, MOODS } from "./config";
import { geminiJson } from "./gemini";
import { getTopics } from "./library";

const BATCH = 25;
const MAX_PER_ASK = 75;

const SYSTEM = `You check items for a personal content recommender. You judge ONLY from the metadata given (title, description, channel or publication, length). Never invent content you cannot see in the metadata.
For each item decide:
- is_quality: true for a real podcast, long-form conversation/interview, quality long-form article, or an earnings call transcript from a listed company, AND ALSO for short clips, shorts, highlights, trailers, compilations and short videos that carry real substance (for example a key moment from an interview, a talk excerpt, an explainer, a funny or inspiring moment). Short and highlight content is welcome. False only for: music videos, ads and sales content, spam or clickbait with no substance, news briefs, SEO pages, listicles, press releases, stock-price pages, livestream recordings with no substance, academic papers, journal articles, research abstracts, whitepapers, textbooks and course material. Items of type "watch" are videos, "listen" are audio podcasts, "read" are articles or transcripts.
- read_minutes: for type "read" only, your best estimate of reading time in whole minutes from the title and snippet (a typical long-form article is 8-30; an earnings call transcript is 40-90). Use 0 for watch and listen items.
- reason: one short line explaining the decision.
- language: "en" for English, "hi" for Hindi (including Hinglish), otherwise "other".
- topics: zero or more tags chosen ONLY from the allowed topic list.
- moods: zero or more tags chosen ONLY from the allowed mood list.
- summary: one plain-English line saying what the item is about, using only the metadata.
Return one result per input item, using the same id.`;

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
          is_quality: { type: "boolean" },
          reason: { type: "string" },
          language: { type: "string" },
          topics: { type: "array", items: { type: "string" } },
          moods: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          read_minutes: { type: "integer" },
        },
        required: ["id", "is_quality", "reason", "language", "topics", "moods", "summary", "read_minutes"],
      },
    },
  },
  required: ["results"],
};

type Row = {
  id: number; title: string; description: string | null; source_name: string;
  duration_sec: number | null; hint_language: string | null; format: string;
};
type Result = {
  id: string; is_quality: boolean; reason: string; language: string;
  topics: string[]; moods: string[]; summary: string; read_minutes: number;
};

/**
 * Gemini STEP 1: check each new item once and store the result on it.
 * Items under 30 seconds are rejected by code and never sent to Gemini.
 * Returns how many items could not be checked (Gemini failed twice); those stay unchecked and are never shown.
 */
export async function checkNewItems(): Promise<{ checked: number; failed: number }> {
  await q(
    `update content_items set is_quality = false, check_reason = 'Under 30 seconds', checked_at = now()
     where checked_at is null and format in ('watch','listen') and coalesce(duration_sec, 0) < ${MIN_DURATION_SEC}`,
  );
  const rows = await q<Row>(
    `select id, title, description, source_name, duration_sec, hint_language, format from (
       select *, row_number() over (partition by format order by coalesce(views, 0) desc, id desc) as rn
       from content_items where checked_at is null
     ) t order by rn, format limit ${MAX_PER_ASK}`,
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
          minutes: r.duration_sec ? Math.max(1, Math.round(r.duration_sec / 60)) : null,
          language_hint: r.hint_language || null,
          description: (r.description ?? "").slice(0, 600),
        })),
      });
      try {
        const { results } = await geminiJson<{ results: Result[] }>(SYSTEM, prompt, SCHEMA);
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
            read_minutes: Number.isFinite(r.read_minutes) && r.read_minutes > 0 ? Math.round(r.read_minutes) : null,
          }));
        if (clean.length) {
          await q(
            `update content_items ci set is_quality = x.is_quality, check_reason = x.reason, language = x.language,
               topic_tags = x.topics, mood_tags = x.moods, summary = x.summary,
               read_min = case when ci.format = 'read' then x.read_minutes else ci.read_min end, checked_at = now()
             from jsonb_to_recordset($1::jsonb) as x(id bigint, is_quality boolean, reason text, language text, topics text[], moods text[], summary text, read_minutes int)
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
