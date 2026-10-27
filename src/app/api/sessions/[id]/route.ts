import { handle } from "@/lib/http";
import { loadSession } from "@/lib/sessions";

// Lobby state, polled by both phones. Only participants unlocked on this device can read it.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { session, participants, mine } = await loadSession((await ctx.params).id);
    return {
      id: session.id,
      mode: session.mode,
      status: session.status,
      joinCode: session.join_code,
      format: session.shared_format,
      creatorId: session.created_by,
      mine,
      participants: participants.map((p) => ({
        profileId: p.profileId, name: p.name, mood: p.mood, topic: p.topic, time: p.timeKey, ready: p.ready,
      })),
    };
  });
}
