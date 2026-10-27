import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireProfile } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

// Create an ask. Step 1 supports solo mode; together mode arrives in step 3.
export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const parts = Array.isArray(body.participants) ? body.participants : [];
    if (parts.length !== 1) throw new HttpError(400, "Solo mode needs exactly one participant");
    const format = ["any", "watch", "listen", "read"].includes(body.format) ? body.format : "any";
    const p = parts[0];
    await requireProfile(Number(p.profileId));
    const s = await q1<{ id: string }>(
      "insert into sessions (mode, shared_format, ask_id, created_by) values ('solo', $1, $2, $3) returning id",
      [format, body.askId ?? null, Number(p.profileId)],
    );
    await q(
      "insert into session_participants (session_id, profile_id, mood, topic, time_slot) values ($1, $2, $3, $4, $5)",
      [s!.id, Number(p.profileId), p.mood || null, p.topic || null, p.time || null],
    );
    return { sessionId: s!.id };
  });
}
