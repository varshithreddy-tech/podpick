import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { passwordMatches, setDeviceCookie } from "@/lib/auth";

export async function POST(req: Request) {
  return handle(async () => {
    const { password } = await req.json();
    if (!passwordMatches(String(password ?? ""))) {
      await new Promise((r) => setTimeout(r, 600));
      throw new HttpError(401, "Wrong password");
    }
    await setDeviceCookie();
    return { ok: true };
  });
}
