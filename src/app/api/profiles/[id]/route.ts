import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { hashPin, requireProfile } from "@/lib/auth";
import { q } from "@/lib/db";

// Edit a profile's name or PIN. The profile must be unlocked on this device.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = Number((await ctx.params).id);
    await requireProfile(id);
    const b = await req.json();
    if (typeof b.name === "string") {
      const name = b.name.trim().slice(0, 40);
      if (!name) throw new HttpError(400, "Name can't be empty");
      await q("update profiles set name = $2 where id = $1", [id, name]);
    }
    if ("pin" in b) {
      if (b.pin === null || b.pin === "") await q("update profiles set pin_hash = null, pin_fails = 0, locked_until = null where id = $1", [id]);
      else if (/^\d{4}$/.test(String(b.pin))) await q("update profiles set pin_hash = $2, pin_fails = 0, locked_until = null where id = $1", [id, hashPin(String(b.pin))]);
      else throw new HttpError(400, "PIN must be 4 digits");
    }
    return { ok: true };
  });
}
