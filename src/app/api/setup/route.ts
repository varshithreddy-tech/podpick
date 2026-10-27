import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { hashPin, requireDevice, unlockProfile } from "@/lib/auth";
import { q1 } from "@/lib/db";

export async function POST(req: Request) {
  return handle(async () => {
    await requireDevice();
    const { slot, name, pin } = await req.json();
    if (slot !== 1 && slot !== 2) throw new HttpError(400, "Bad profile slot");
    const clean = String(name ?? "").trim().slice(0, 40);
    if (!clean) throw new HttpError(400, "Name is required");
    if (pin && !/^\d{4}$/.test(String(pin))) throw new HttpError(400, "PIN must be 4 digits");
    if (await q1("select 1 from profiles where slot = $1", [slot])) throw new HttpError(409, "That profile already exists");
    const row = await q1<{ id: number }>(
      "insert into profiles (slot, name, pin_hash) values ($1, $2, $3) returning id",
      [slot, clean, pin ? hashPin(String(pin)) : null],
    );
    if (pin) await unlockProfile(row!.id, String(pin));
    return { id: row!.id };
  });
}
