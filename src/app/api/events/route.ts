import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireDevice, requireProfile } from "@/lib/auth";
import { q } from "@/lib/db";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await req.json();
    if (b.type === "ask_opened") {
      await requireDevice();
      if (!b.askId) throw new HttpError(400, "askId required");
      await q("insert into events (type, ask_id) values ('ask_opened', $1)", [String(b.askId)]);
    } else if (b.type === "item_opened") {
      const profileId = Number(b.profileId);
      await requireProfile(profileId);
      await q(
        `insert into events (type, ask_id, profile_id, session_id, item_id)
         select 'item_opened', s.ask_id, $2, s.id, $3 from sessions s where s.id = $1`,
        [b.sessionId, profileId, Number(b.itemId)],
      );
    } else throw new HttpError(400, "Unknown event");
    return { ok: true };
  });
}
