import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { q1 } from "@/lib/db";
import { getHighlights } from "@/lib/highlights";
import { loadSession } from "@/lib/sessions";

export const maxDuration = 60;

// Highlights for one of the picks in a session. Only that session's participants (unlocked here) may ask.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const itemId = Number((await ctx.params).id);
    const { sessionId } = await req.json();
    await loadSession(String(sessionId));
    const shown = await q1("select 1 from recommendations where session_id = $1 and item_id = $2", [sessionId, itemId]);
    if (!shown) throw new HttpError(403, "That item is not part of this session");
    return getHighlights(itemId);
  });
}
