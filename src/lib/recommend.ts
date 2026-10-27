import { q, q1 } from "./db";
import { HttpError, MAX_PICKS } from "./config";
import { checkNewItems } from "./itemCheck";
import { eligibleItems, type Item } from "./library";
import { refreshLibrary } from "./fetchers";
import { rankItems, type Pick } from "./rank";
import { loadSession } from "./sessions";

const slim = (i: Item & { paywalled?: boolean; we_subscribe?: boolean }) => ({
  id: i.id, format: i.format, url: i.url, title: i.title, thumbnail: i.thumbnail,
  source_name: i.paywalled && i.we_subscribe ? `${i.source_name} (subscribed)` : i.source_name,
  duration_sec: i.duration_sec, read_min: i.read_min,
});

export type PickOut = {
  rank: number;
  reason: string;
  combined: number;
  scores: Pick["scores"];
  item: ReturnType<typeof slim>;
};

export type RecommendResponse =
  | { status: "running" }
  | {
      status: "ok";
      mode: "solo" | "together";
      picks: PickOut[];
      message: string | null;
      notes: string[];
      fallbacks?: Record<string, PickOut | null>;
      participants: { profileId: number; name: string }[];
      mine: number[];
    };

const toOut = (p: Pick): PickOut => ({ rank: p.rank, reason: p.reason, combined: p.combined, scores: p.scores, item: slim(p.item) });

function messageFor(n: number, mode: "solo" | "together"): string | null {
  if (n >= MAX_PICKS) return null;
  if (n === 0) return mode === "together" ? "No strong match for both of you today." : "No strong matches today.";
  return `Only ${n} strong match${n === 1 ? "" : "es"} today.`;
}

async function storedResult(sessionId: string, mode: "solo" | "together", base: object): Promise<RecommendResponse> {
  const rows = await q<any>(
    `select r.rank, r.reason, r.scores, r.for_profile, ci.*, s.paywalled, s.we_subscribe
     from recommendations r join content_items ci on ci.id = r.item_id join sources s on s.id = ci.source_id
     where r.session_id = $1 order by r.rank`,
    [sessionId],
  );
  const out = (r: any): PickOut => ({
    rank: r.rank, reason: r.reason, scores: r.scores,
    combined: Math.min(...(Object.values(r.scores) as any[]).map((s) => s.final)),
    item: slim(r),
  });
  const picks = rows.filter((r: any) => r.for_profile == null).map(out);
  const fallbackRows = rows.filter((r: any) => r.for_profile != null);
  const fallbacks = fallbackRows.length
    ? Object.fromEntries(fallbackRows.map((r: any) => [String(r.for_profile), out(r)]))
    : undefined;
  return { ...(base as any), picks, message: messageFor(picks.length, mode), notes: [], fallbacks };
}

export async function recommend(sessionId: string): Promise<RecommendResponse> {
  const { session, participants, mine } = await loadSession(sessionId);
  const base = {
    status: "ok" as const,
    mode: session.mode,
    participants: participants.map((p) => ({ profileId: p.profileId, name: p.name })),
    mine,
  };

  if (session.status === "done") return storedResult(sessionId, session.mode, base);
  if (session.status === "expired") throw new HttpError(410, "This session was cancelled or timed out");
  if (session.mode === "together" && (participants.length < 2 || !participants.every((p) => p.ready))) {
    throw new HttpError(409, "Waiting for both people to be ready");
  }

  // Claim the run so two phones can't both start it. A stuck run is retaken after two minutes.
  const claimed = await q1(
    `update sessions set status = 'running', started_at = now()
     where id = $1 and (status = 'open' or (status = 'running' and started_at < now() - interval '120 seconds'))
     returning id`,
    [sessionId],
  );
  if (!claimed) {
    const again = await q1<{ status: string }>("select status from sessions where id = $1", [sessionId]);
    if (again?.status === "done") return storedResult(sessionId, session.mode, base);
    return { status: "running" };
  }

  try {
    const filters = { format: session.shared_format, participants };
    const notes = await refreshLibrary(filters);

    const { failed } = await checkNewItems();
    if (failed > 0) notes.push(`${failed} new item${failed === 1 ? "" : "s"} couldn't be checked and ${failed === 1 ? "was" : "were"} left out this time`);

    const candidates = await eligibleItems(filters);
    const ranked = await rankItems(candidates, participants);
    const picks = ranked.picks.map(toOut);

    const rows = ranked.picks.map((p) => ({ item: p.item, rank: p.rank, scores: p.scores, reason: p.reason, forProfile: null as number | null }));
    let fallbacks: Record<string, PickOut | null> | undefined;
    if (session.mode === "together" && picks.length === 0) {
      fallbacks = {};
      const seen = new Set<string>();
      for (const [pid, best] of Object.entries(ranked.bestPerPerson)) {
        fallbacks[pid] = best ? toOut(best) : null;
        if (best && !seen.has(`${best.item.id}`)) {
          seen.add(`${best.item.id}`);
          rows.push({ item: best.item, rank: 1, scores: best.scores, reason: best.scores[pid]?.reason ?? best.reason, forProfile: Number(pid) });
        }
      }
    }
    if (rows.length) {
      await q(
        `insert into recommendations (session_id, item_id, rank, scores, reason, for_profile)
         select $1, t.item_id, t.rank, t.scores::jsonb, t.reason, t.for_profile
         from unnest($2::bigint[], $3::int[], $4::text[], $5::text[], $6::int[]) as t(item_id, rank, scores, reason, for_profile)
         on conflict (session_id, item_id) do nothing`,
        [
          sessionId,
          rows.map((r) => r.item.id),
          rows.map((r) => r.rank),
          rows.map((r) => JSON.stringify(r.scores)),
          rows.map((r) => r.reason),
          rows.map((r) => r.forProfile),
        ],
      );
    }
    await q("update sessions set status = 'done', join_code = null where id = $1", [sessionId]);

    return { ...base, picks, message: messageFor(picks.length, session.mode), notes, fallbacks };
  } catch (e) {
    await q("update sessions set status = 'open' where id = $1", [sessionId]);
    console.error("Recommend failed", e);
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, "Couldn't rank right now. Try again in a minute.");
  }
}
