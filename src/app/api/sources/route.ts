import { handle } from "@/lib/http";
import { requireDevice, requireProfile } from "@/lib/auth";
import { q } from "@/lib/db";

// Settings: this profile's taste sources, plus the paywalled publications (shared) with their "We subscribe" switch.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDevice();
    const profileId = Number(new URL(req.url).searchParams.get("profileId"));
    await requireProfile(profileId);
    const mine = await q(
      `select s.id, s.name, s.kind, s.thumbnail, s.enabled, ps.origin
       from profile_sources ps join sources s on s.id = ps.source_id where ps.profile_id = $1 order by s.name`,
      [profileId],
    );
    const publications = await q("select id, name, enabled, we_subscribe from sources where paywalled order by name");
    return { mine, publications };
  });
}
