import { LIBRARY_TARGET } from "./config";
import { eligibleItems, fetchFromYouTube, type Filters } from "./library";

type Fmt = "watch" | "listen" | "read";

/**
 * Library first: fetch from live sources only when there are fewer than about 30 eligible candidates
 * (for "Any" format, about 10 per format so every format gets a fair chance). Returns user-facing notes.
 */
export async function refreshLibrary(f: Filters): Promise<string[]> {
  const formats: Fmt[] = f.format === "any" ? ["watch", "listen", "read"] : [f.format as Fmt];
  const target = f.format === "any" ? Math.ceil(LIBRARY_TARGET / 3) : LIBRARY_TARGET;

  const jobs: Promise<string[]>[] = [];
  for (const fmt of formats) {
    const count = (await eligibleItems({ ...f, format: fmt }, { applyMood: true })).length;
    if (count >= target) continue;
    if (fmt === "watch") jobs.push(fetchFromYouTube({ ...f, format: fmt }));
  }
  return (await Promise.all(jobs)).flat();
}
