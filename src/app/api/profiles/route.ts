import { handle } from "@/lib/http";
import { isUnlocked, requireDevice, type Profile } from "@/lib/auth";
import { q } from "@/lib/db";

// Names and lock state only. No private data is returned here.
export async function GET() {
  return handle(async () => {
    await requireDevice();
    const rows = await q<Profile>("select * from profiles order by slot");
    return {
      profiles: await Promise.all(
        rows.map(async (p) => ({ id: p.id, slot: p.slot, name: p.name, hasPin: !!p.pin_hash, unlocked: await isUnlocked(p) })),
      ),
    };
  });
}
