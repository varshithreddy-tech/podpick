import { handle } from "@/lib/http";
import { requireDevice } from "@/lib/auth";
import { MOODS, TIME_SLOTS, STARTER_SOURCES } from "@/lib/config";
import { getTopics } from "@/lib/library";

export async function GET() {
  return handle(async () => {
    await requireDevice();
    return {
      moods: MOODS,
      topics: await getTopics(),
      timeSlots: TIME_SLOTS.map((s) => ({ key: s.key, label: s.label })),
      starterSources: STARTER_SOURCES,
    };
  });
}
