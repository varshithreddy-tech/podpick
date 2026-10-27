import { handle } from "@/lib/http";
import { recommend } from "@/lib/recommend";

export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => recommend((await ctx.params).id));
}
