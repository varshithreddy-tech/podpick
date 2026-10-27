import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { unlockedAmong } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { newJoinCode } from "@/lib/sessions";

/**
 * Create an ask.
 *  - solo:     one participant.
 *  - together: two participants on this device (both profiles must be unlocked here).
 *  - remote:   a together session for two phones; the creator gets a join code and the other person joins later.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const parts: { profileId: number; mood?: string; topic?: string; time?: string }[] = Array.isArray(body.participants) ? body.participants : [];
    const mode: string = body.mode ?? "solo";
    const format = ["any", "watch", "listen", "read"].includes(body.format) ? body.format : "any";
    const ids = parts.map((p) => Number(p.profileId));
    if (new Set(ids).size !== ids.length) throw new HttpError(400, "Pick two different people");
    if ((mode === "solo" || mode === "remote") && ids.length !== 1) throw new HttpError(400, "Exactly one participant is needed");
    if (mode === "together" && ids.length !== 2) throw new HttpError(400, "Together mode needs two participants");
    if (!["solo", "together", "remote"].includes(mode)) throw new HttpError(400, "Bad mode");

    const open = await unlockedAmong(ids);
    if (open.length !== ids.length) throw new HttpError(401, "Unlock every selected profile first", "locked");

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
