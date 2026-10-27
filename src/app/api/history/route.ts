import { handle } from "@/lib/http";
import { requireProfile } from "@/lib/auth";
import { q } from "@/lib/db";

// Everything shown to this profile (solo and together sessions they took part in), with their rating.
export async function GET(req: Request) {
  return handle(async () => {
    const profileId = Number(new URL(req.url).searchParams.get("profileId"));
    await requireProfile(profileId);
    const items = await q(
      `select ci.id, ci.format, ci.url, ci.title, ci.thumbnail, ci.source_name, ci.duration_sec, ci.read_min,
              r.shown_at, s.mode, s.id as session_id,
              (select f.value from feedback f where f.profile_id = $1 and f.item_id = ci.id and f.value in ('love','dislike') limit 1) as rating,
              exists (select 1 from feedback f where f.profile_id = $1 and f.item_id = ci.id and f.value = 'save') as saved
       from recommendations r
       join sessions s on s.id = r.session_id
       join session_participants sp on sp.session_id = s.id and sp.profile_id = $1
       join content_items ci on ci.id = r.item_id
       order by r.shown_at desc, r.rank limit 300`,
      [profileId],
    );
    return { items };
  });
}
