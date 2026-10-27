import { handle } from "@/lib/http";
import { requireProfile } from "@/lib/auth";
import { q1 } from "@/lib/db";

// Is the other person waiting in an open "Both" session? Only visible to an unlocked profile.
export async function GET(req: Request) {
  return handle(async () => {
    const profileId = Number(new URL(req.url).searchParams.get("profileId"));
    await requireProfile(profileId);
    const w = await q1<{ id: string; name: string }>(
      `select s.id, p.name from sessions s
       join session_participants sp on sp.session_id = s.id join profiles p on p.id = sp.profile_id
       where s.pair and s.status = 'open' and s.created_at > now() - interval '30 minutes'
         and not exists (select 1 from session_participants x where x.session_id = s.id and x.profile_id = $1)
       limit 1`,
      [profileId],
    );
    return { waiting: w?.name ?? null };
  });
}
