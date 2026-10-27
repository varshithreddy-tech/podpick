import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireProfile } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

// Join a together session from a second phone using its short code.
export async function POST(req: Request) {
  return handle(async () => {
    const { code, profileId } = await req.json();
    const pid = Number(profileId);
    await requireProfile(pid);
    const s = await q1<{ id: string }>(
      `select id from sessions where join_code = $1 and status = 'open' and created_at > now() - interval '3 hours'`,
      [String(code ?? "").trim().toUpperCase()],
    );
    if (!s) throw new HttpError(404, "No open session with that code");
    const existing = await q<{ profile_id: number }>("select profile_id from session_participants where session_id = $1", [s.id]);
    if (existing.some((e) => e.profile_id === pid)) return { sessionId: s.id };
    if (existing.length >= 2) throw new HttpError(409, "That session is already full");
    await q("insert into session_participants (session_id, profile_id) values ($1, $2)", [s.id, pid]);
    return { sessionId: s.id };
  });
}
