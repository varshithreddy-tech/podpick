import { q, q1 } from "./db";
import { HttpError, MAX_PICKS } from "./config";
import { requireProfile } from "./auth";
import { checkNewItems } from "./itemCheck";
import { eligibleItems, fetchFromYouTube, needsFetch, type Item, type Participant } from "./library";
import { rankItems, type Pick } from "./rank";

export type PickOut = {
  rank: number;
  reason: string;
  combined: number;
  scores: Pick["scores"];
  item: ReturnType<typeof slim>;
};

export type RecommendResponse = {
  status: "ok";
  mode: "solo" | "together";
  picks: PickOut[];
  message: string | null;
  notes: string[];
  fallbacks?: Record<string, PickOut | null>;
  participants: { profileId: number; name: string }[];
};

const slim = (i: Item) => ({
  id: i.id, format: i.format, url: i.url, title: i.title, thumbnail: i.thumbnail,
  source_name: i.source_name, duration_sec: i.duration_sec, read_min: i.read_min,
});

const toOut = (p: Pick): PickOut => ({ rank: p.rank, reason: p.reason, combined: p.combined, scores: p.scores, item: slim(p.item) });

function messageFor(n: number, mode: "solo" | "together"): string | null {
  if (n >= MAX_PICKS) return null;
  if (n === 0) return mode === "together" ? "No strong match for both of you today." : "No strong matches today.";
  return `Only ${n} strong match${n === 1 ? "" : "es"} today.`;
}

export async function loadSession(sessionId: string) {
  const s = await q1<{ id: string; mode: "solo" | "together"; shared_format: string; status: string }>(
    "select id, mode, shared_format, status from sessions where id = $1", [sessionId],
  );
  if (!s) throw new HttpError(404, "Session not found");
  const parts = await q<{ profile_id: number; name: string; mood: string | null; topic: string | null; time_slot: string | null }>(
    `select sp.profile_id, p.name, sp.mood, sp.topic, sp.time_slot
     from session_participants sp join profiles p on p.id = sp.profile_id
     where sp.session_id = $1 order by p.slot`, [sessionId],
  );
  // Privacy: every participant's profile must be unlocked on this device.
  for (const p of parts) await requireProfile(p.profile_id);
  const participants: Participant[] = parts.map((p) => ({
    profileId: p.profile_id, name: p.name, mood: p.mood, topic: p.topic, timeKey: p.time_slot,
  }));
  return { session: s, participants };
}

export async function recommend(sessionId: string): Promise<RecommendResponse> {
  const { session, participants } = await loadSession(sessionId);
  const base = { status: "ok" as const, mode: session.mode, participants: participants.map((p) => ({ profileId: p.profileId, name: p.name })) };

  // Idempotent: reopening a session shows the same picks, never new ones.
  if (session.status === "done") {
    const rows = await q<any>(
      `select r.rank, r.reason, r.scores, ci.* from recommendations r join content_items ci on ci.id = r.item_id
       where r.session_id = $1 order by r.rank`, [sessionId],
    );
    const picks: PickOut[] = rows.map((r: any) => ({
      rank: r.rank, reason: r.reason, scores: r.scores,
      combined: Math.min(...(Object.values(r.scores) as any[]).map((s) => s.final)),
      item: slim(r),
    }));
    return { ...base, picks, message: messageFor(picks.length, session.mode), notes: [] };
  }

  const filters = { format: session.shared_format, participants };
  const notes: string[] = [];

  // Library first; fetch only when thin.
  if ((session.shared_format === "any" || session.shared_format === "watch") && (await needsFetch(filters))) {
    notes.push(...(await fetchFromYouTube(filters)));
  }

  const { failed } = await checkNewItems();
  if (failed > 0) notes.push(`${failed} new item${failed === 1 ? "" : "s"} couldn't be checked and ${failed === 1 ? "was" : "were"} left out this time`);

  const candidates = await eligibleItems(filters);
  let ranked;
  try {
    ranked = await rankItems(candidates, participants);
  } catch (e) {
    console.error("Ranking failed", e);
    throw new HttpError(502, "Couldn't rank right now. Try again in a minute.");
  }

  const picks = ranked.picks.map(toOut);
  if (ranked.picks.length) {
    await q(
      `insert into recommendations (session_id, item_id, rank, scores, reason)
       select $1, t.item_id, t.rank, t.scores::jsonb, t.reason
       from unnest($2::bigint[], $3::int[], $4::text[], $5::text[]) as t(item_id, rank, scores, reason)
       on conflict (session_id, item_id) do nothing`,
      [
        sessionId,
        ranked.picks.map((p) => p.item.id),
        ranked.picks.map((p) => p.rank),
        ranked.picks.map((p) => JSON.stringify(p.scores)),
        ranked.picks.map((p) => p.reason),
      ],
    );
  }
  await q("update sessions set status = 'done' where id = $1", [sessionId]);

  const out: RecommendResponse = { ...base, picks, message: messageFor(picks.length, session.mode), notes };
  if (session.mode === "together" && picks.length === 0) {
    out.fallbacks = Object.fromEntries(Object.entries(ranked.bestPerPerson).map(([k, v]) => [k, v ? toOut(v) : null]));
  }
  return out;
}
