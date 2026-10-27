import { handle } from "@/lib/http";
import { unlockProfile } from "@/lib/auth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { pin } = await req.json();
    await unlockProfile(Number(id), String(pin ?? ""));
    return { ok: true };
  });
}
