import { SOURCE_PENALTY } from "./config";

/**
 * Source preference rule (code, not AI): a source is lowered for a person only when
 * dislikes >= 3 AND dislikes > loves. One or two dislikes never change a source's standing.
 */
export function sourcePenalty(loves: number, dislikes: number): number {
  return dislikes >= 3 && dislikes > loves ? SOURCE_PENALTY : 0;
}

type Shortlistable = { format: string; topic_tags: string[]; mood_tags: string[]; views: number | null };

/**
 * Trims the candidates sent to the ranker to about `max`, without letting popularity decide who is heard.
 *  1. Items that fit EVERY participant's topic come first (in together mode these are the best bets).
 *  2. Items that fit only some people are then added round-robin, one person at a time, so a niche topic
 *     is not crowded out by a popular one.
 *  3. Formats are balanced, because view counts only exist for videos. No format gets a ranking boost.
 */
export function shortlistCandidates<T extends Shortlistable>(
  candidates: T[],
  participants: { topic: string | null; mood: string | null }[],
  max: number,
): T[] {
  const views = (c: T) => c.views ?? 0;
  const scored = candidates.map((c) => ({
    c,
    fits: participants.map((p) => !p.topic || c.topic_tags.includes(p.topic)),
    moods: participants.filter((p) => p.mood && c.mood_tags.includes(p.mood)).length,
  }));
  const byFit = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.moods - a.moods || views(b.c) - views(a.c);

  const ordered = scored.filter((x) => x.fits.every(Boolean)).sort(byFit);
  const seen = new Set(ordered.map((x) => x.c));
  const partial = scored.filter((x) => !x.fits.every(Boolean));
  const lists = participants.map((_, i) => partial.filter((x) => x.fits[i]).sort(byFit));
  while (lists.some((l) => l.length)) {
    for (const l of lists) {
      const x = l.shift();
      if (x && !seen.has(x.c)) {
        seen.add(x.c);
        ordered.push(x);
      }
    }
  }
  for (const x of scored.filter((x) => !seen.has(x.c)).sort((a, b) => views(b.c) - views(a.c))) ordered.push(x);

  const formats = [...new Set(ordered.map((x) => x.c.format))];
  const perFormat = Math.ceil(max / Math.max(1, formats.length));
  const keep = new Set(formats.flatMap((f) => ordered.filter((x) => x.c.format === f).slice(0, perFormat)).map((x) => x.c));
  return ordered.map((x) => x.c).filter((c) => keep.has(c));
}
