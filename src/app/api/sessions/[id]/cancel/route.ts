import { handle } from "@/lib/http";
import { loadSession } from "@/lib/sessions";
import { q } from "@/lib/db";

// Stop waiting: closes a session that has not started yet.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = (await ctx.params).id;
    await loadSession(id);
    await q("update sessions set status = 'expired' where id = $1 and status = 'open'", [id]);
    return { ok: true };
  });
}
