import { after } from "next/server";
import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireProfile } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { updateTasteSummary } from "@/lib/taste";

const RATE_EVERY = 5;

// Current feedback for a set of items, for one unlocked profile: { itemId: { rating, saved } }
export async function GET(req: Request) {
  return handle(async () => {
    const u = new URL(req.url);
    const profileId = Number(u.searchParams.get("profileId"));
    await requireProfile(profileId);
    const ids = (u.searchParams.get("ids") ?? "").split(",").map(Number).filter(Boolean);
    const rows = ids.length
      ? await q<{ item_id: number; value: string }>(
          "select item_id, value from feedback where profile_id = $1 and item_id = any($2::bigint[])",
          [profileId, ids],
        )
      : [];
    const map: Record<string, { rating: "love" | "dislike" | null; saved: boolean }> = {};
    for (const id of ids) map[id] = { rating: null, saved: false };
    for (const r of rows) {
      if (r.value === "save") map[r.item_id].saved = true;
      else map[r.item_id].rating = r.value as "love" | "dislike";
    }
    return { map };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { profileId, itemId, sessionId, value } = await req.json();
    const pid = Number(profileId);
    const iid = Number(itemId);
    if (!["love", "dislike", "save", "unsave"].includes(value)) throw new HttpError(400, "Bad value");
    await requireProfile(pid);

    // You can only react to items that were actually shown to you.
    const shown = await q1(
      `select 1 from recommendations r join session_participants sp on sp.session_id = r.session_id
       where sp.profile_id = $1 and r.item_id = $2 limit 1`,
      [pid, iid],
    );
    if (!shown) throw new HttpError(403, "That item was not shown to this profile");

    if (value === "unsave") {
      await q("delete from feedback where profile_id = $1 and item_id = $2 and value = 'save'", [pid, iid]);
      return { ok: true };
    }
    if (value === "save") {
      // In a together session, saving puts the item on both participants' lists.
      let targets = [pid];
      if (sessionId) {
        const rows = await q<{ profile_id: number }>(
          `select sp.profile_id from session_participants sp join sessions s on s.id = sp.session_id
           where s.id = $1 and s.mode = 'together'`,
          [sessionId],
        );
        if (rows.some((r) => r.profile_id === pid)) targets = rows.map((r) => r.profile_id);
      }
      await q(
        `insert into feedback (profile_id, item_id, session_id, value)
         select t, $2, $3, 'save' from unnest($1::int[]) as t on conflict do nothing`,
        [targets, iid, sessionId ?? null],
      );
      return { ok: true };
    }

    // Rating. Changing an earlier rating replaces it and does not count as a new one.
    const already = await q1("select 1 from feedback where profile_id = $1 and item_id = $2 and value in ('love','dislike')", [pid, iid]);
    await q("delete from feedback where profile_id = $1 and item_id = $2 and value in ('love','dislike')", [pid, iid]);
    await q(
      "insert into feedback (profile_id, item_id, session_id, value) values ($1, $2, $3, $4)",
      [pid, iid, sessionId ?? null, value],
    );
    if (!already) {
      const p = await q1<{ ratings_since_summary: number }>(
        "update profiles set ratings_since_summary = ratings_since_summary + 1 where id = $1 returning ratings_since_summary",
        [pid],
      );
      if (p && p.ratings_since_summary >= RATE_EVERY) after(() => updateTasteSummary(pid));
    }
    return { ok: true };
  });
}
