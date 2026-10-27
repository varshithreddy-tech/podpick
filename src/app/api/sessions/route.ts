import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { unlockedAmong } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { newJoinCode } from "@/lib/sessions";

type Part = { profileId: number; mood?: string; topic?: string; time?: string };

/**
 * Create an ask.
 *  - solo:     one participant.
 *  - together: two participants on this one device (both profiles must be unlocked here).
 *  - pair:     "Both" on two phones. Each person sends their own choices; the two requests are matched
 *              automatically (no code). The first creates a waiting session, the second joins it.
 *  - remote:   older join-code flow, kept for compatibility.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const parts: Part[] = Array.isArray(body.participants) ? body.participants : [];
    const mode: string = body.mode ?? "solo";
    const format = ["any", "watch", "listen", "read"].includes(body.format) ? body.format : "any";
    const ids = parts.map((p) => Number(p.profileId));
    if (!["solo", "together", "pair", "remote"].includes(mode)) throw new HttpError(400, "Bad mode");
    if (new Set(ids).size !== ids.length) throw new HttpError(400, "Pick two different people");
    if (mode !== "together" && ids.length !== 1) throw new HttpError(400, "Exactly one participant is needed");
    if (mode === "together" && ids.length !== 2) throw new HttpError(400, "Together mode needs two participants");

    const open = await unlockedAmong(ids);
    if (open.length !== ids.length) throw new HttpError(401, "Unlock every selected profile first", "locked");

    if (mode === "pair") return pair(parts[0], format, body.askId ?? null);

    const dbMode = mode === "solo" ? "solo" : "together";
    let sessionId: string | null = null;
    let joinCode: string | null = null;
    for (let attempt = 0; attempt < 8 && !sessionId; attempt++) {
      joinCode = mode === "remote" ? newJoinCode() : null;
      try {
        const s = await q1<{ id: string }>(
          "insert into sessions (mode, shared_format, ask_id, created_by, join_code) values ($1, $2, $3, $4, $5) returning id",
          [dbMode, format, body.askId ?? null, ids[0], joinCode],
        );
        sessionId = s!.id;
      } catch (e: any) {
        if (mode !== "remote" || !String(e?.message).includes("join_code")) throw e;
      }
    }
    if (!sessionId) throw new HttpError(500, "Could not create a join code, try again");

    for (const p of parts) {
      await q(
        "insert into session_participants (session_id, profile_id, mood, topic, time_slot, ready) values ($1, $2, $3, $4, $5, $6)",
        [sessionId, Number(p.profileId), p.mood || null, p.topic || null, p.time || null, mode !== "remote"],
      );
    }
    return { sessionId, joinCode };
  });
}

async function pair(p: Part, format: string, askId: string | null) {
  const pid = Number(p.profileId);
  const fields = [p.mood || null, p.topic || null, p.time || null];

  // A person who walked away leaves a stale waiting session; it expires after 30 minutes.
  await q("update sessions set status = 'expired' where pair and status = 'open' and created_at < now() - interval '30 minutes'");

  for (let attempt = 0; attempt < 3; attempt++) {
    const open = await q1<{ id: string; mine: boolean; n: number; shared_format: string }>(
      `select s.id, s.shared_format, bool_or(sp.profile_id = $1) as mine, count(*)::int as n
       from sessions s join session_participants sp on sp.session_id = s.id
       where s.pair and s.status = 'open' group by s.id, s.shared_format order by min(s.created_at) desc limit 1`,
      [pid],
    );
    if (open) {
      if (open.mine) {
        // Tapped again: update my choices on my own waiting session.
        await q("update session_participants set mood = $3, topic = $4, time_slot = $5, ready = true where session_id = $1 and profile_id = $2", [open.id, pid, ...fields]);
        return { sessionId: open.id };
      }
      if (open.n < 2) {
        await q(
          `insert into session_participants (session_id, profile_id, mood, topic, time_slot, ready) values ($1, $2, $3, $4, $5, true)
           on conflict (session_id, profile_id) do update set mood = excluded.mood, topic = excluded.topic, time_slot = excluded.time_slot, ready = true`,
          [open.id, pid, ...fields],
        );
        // Format is shared: the first person's choice stands unless they left it on Any.
        if (open.shared_format === "any" && format !== "any") await q("update sessions set shared_format = $2 where id = $1", [open.id, format]);
        return { sessionId: open.id };
      }
    }
    try {
      const s = await q1<{ id: string }>(
        "insert into sessions (mode, pair, shared_format, ask_id, created_by) values ('together', true, $1, $2, $3) returning id",
        [format, askId, pid],
      );
      await q("insert into session_participants (session_id, profile_id, mood, topic, time_slot, ready) values ($1, $2, $3, $4, $5, true)", [s!.id, pid, ...fields]);
      return { sessionId: s!.id };
    } catch (e: any) {
      // Both people tapped at the same instant: the unique index let only one session in. Loop to join it.
      if (!String(e?.message).includes("one_open_pair")) throw e;
    }
  }
  throw new HttpError(500, "Couldn't pair up, try again");
}
