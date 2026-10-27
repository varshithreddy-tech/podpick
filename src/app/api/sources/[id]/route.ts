import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireDevice } from "@/lib/auth";
import { q1 } from "@/lib/db";

// Switch a source on or off, or mark a paywalled one as "We subscribe".
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireDevice();
    const id = Number((await ctx.params).id);
    const b = await req.json();
    const row = await q1(
      `update sources set enabled = coalesce($2::boolean, enabled), we_subscribe = coalesce($3::boolean, we_subscribe)
       where id = $1 returning id`,
      [id, typeof b.enabled === "boolean" ? b.enabled : null, typeof b.we_subscribe === "boolean" ? b.we_subscribe : null],
    );
    if (!row) throw new HttpError(404, "Source not found");
    return { ok: true };
  });
}
