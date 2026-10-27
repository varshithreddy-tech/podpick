import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireProfile } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

// Add a confirmed YouTube channel as a taste source for this profile.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const profileId = Number((await ctx.params).id);
    await requireProfile(profileId);
    const { channelId, title, thumbnail, origin } = await req.json();
    if (!channelId || !title) throw new HttpError(400, "channelId and title are required");
    const src = await q1<{ id: number }>(
      `insert into sources (kind, external_id, name, url, thumbnail) values ('youtube_channel', $1, $2, $3, $4)
       on conflict (kind, external_id) do update set name = excluded.name, thumbnail = excluded.thumbnail returning id`,
      [channelId, title, `https://www.youtube.com/channel/${channelId}`, thumbnail ?? null],
    );
    await q(
      "insert into profile_sources (profile_id, source_id, origin) values ($1, $2, $3) on conflict do nothing",
      [profileId, src!.id, origin === "added" ? "added" : "starter"],
    );
    return { ok: true };
  });
}
