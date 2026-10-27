import { q, q1 } from "./db";
import { HttpError } from "./config";
import { unlockedAmong } from "./auth";
import type { Participant } from "./library";

export type SessionRow = {
  id: string;
  mode: "solo" | "together";
  shared_format: string;
  status: "open" | "running" | "done";
  join_code: string | null;
  created_by: number | null;
  started_at: string | null;
};

export type SessionParticipant = Participant & { ready: boolean };

/**
 * Loads a session. The caller must have at least one of its participants unlocked on this device
 * (a participant of a together session may read the shared session; nobody else may).
 */
export async function loadSession(sessionId: string) {
  const session = await q1<SessionRow>(
    "select id, mode, shared_format, status, join_code, created_by, started_at from sessions where id = $1",
    [sessionId],
  );
  if (!session) throw new HttpError(404, "Session not found");
  const rows = await q<{ profile_id: number; name: string; mood: string | null; topic: string | null; time_slot: string | null; ready: boolean }>(
    `select sp.profile_id, p.name, sp.mood, sp.topic, sp.time_slot, sp.ready
     from session_participants sp join profiles p on p.id = sp.profile_id
     where sp.session_id = $1 order by p.slot`,
    [sessionId],
  );
  const mine = await unlockedAmong(rows.map((r) => r.profile_id));
  if (!mine.length) throw new HttpError(401, "Unlock a profile in this session first", "locked");
  const participants: SessionParticipant[] = rows.map((r) => ({
    profileId: r.profile_id, name: r.name, mood: r.mood, topic: r.topic, timeKey: r.time_slot, ready: r.ready,
  }));
  return { session, participants, mine };
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newJoinCode() {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}
