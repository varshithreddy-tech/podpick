import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireDevice } from "@/lib/auth";
import { q } from "@/lib/db";
import { getTopics } from "@/lib/library";

export async function GET() {
  return handle(async () => {
    await requireDevice();
    return { topics: await getTopics() };
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await requireDevice();
    const { topics } = await req.json();
    const clean = [...new Set((Array.isArray(topics) ? topics : []).map((t: unknown) => String(t).trim().slice(0, 60)).filter(Boolean))];
    if (clean.length < 1 || clean.length > 12) throw new HttpError(400, "Keep between 1 and 12 topics");
    await q(
      "insert into settings (key, value) values ('topics', $1::jsonb) on conflict (key) do update set value = excluded.value",
      [JSON.stringify(clean)],
    );
    return { topics: clean };
  });
}
