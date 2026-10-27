import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireProfile } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

// A participant sets their own mood, topic and time and marks themselves ready.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const b = await req.json();
    const pid = Number(b.profileId);
    await requireProfile(pid);
    const s = await q1<{ status: string }>("select status from sessions where id = $1", [id]);
    if (!s) throw new HttpError(404, "Session not found");
    if (s.status !== "open") throw new HttpError(409, "This session already started");
    const row = await q1(
      `update session_participants set mood = $3, topic = $4, time_slot = $5, ready = $6
       where session_id = $1 and profile_id = $2 returning profile_id`,
      [id, pid, b.mood || null, b.topic || null, b.time || null, !!b.ready],
    );
    if (!row) throw new HttpError(403, "You are not in this session");
    return { ok: true };
  });
}
