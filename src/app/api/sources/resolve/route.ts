import { handle } from "@/lib/http";
import { HttpError } from "@/lib/config";
import { requireDevice } from "@/lib/auth";
import { QuotaError, channelFromLink, searchChannels } from "@/lib/sources/youtube";

export async function GET(req: Request) {
  return handle(async () => {
    await requireDevice();
    const u = new URL(req.url);
    const link = u.searchParams.get("link");
    const query = u.searchParams.get("q");
    try {
      if (link) return { candidates: [await channelFromLink(link)] };
      if (query) return { candidates: await searchChannels(query) };
    } catch (e) {
      if (e instanceof QuotaError) throw new HttpError(429, "YouTube limit reached today");
      throw e;
    }
    throw new HttpError(400, "Provide q or link");
  });
}
