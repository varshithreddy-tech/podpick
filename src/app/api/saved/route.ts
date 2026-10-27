import { handle } from "@/lib/http";
import { requireProfile } from "@/lib/auth";
import { q } from "@/lib/db";

// Saved for later: this profile's saved items that they have not rated yet.
export async function GET(req: Request) {
  return handle(async () => {
    const profileId = Number(new URL(req.url).searchParams.get("profileId"));
    await requireProfile(profileId);
    const items = await q(
      `select ci.id, ci.format, ci.url, ci.title, ci.thumbnail, ci.source_name, ci.duration_sec, ci.read_min, ci.summary
       from feedback f join content_items ci on ci.id = f.item_id
       where f.profile_id = $1 and f.value = 'save'
         and not exists (select 1 from feedback r where r.profile_id = $1 and r.item_id = f.item_id and r.value in ('love','dislike'))
       order by f.created_at desc`,
      [profileId],
    );
    return { items };
  });
}
