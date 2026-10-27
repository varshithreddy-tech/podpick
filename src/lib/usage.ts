import { q, q1 } from "./db";
import { env } from "./config";

export async function recordUsage(
  service: "youtube" | "gemini" | "tavily" | "podcastindex" | "itunes",
  u: { units?: number; calls?: number; tokensIn?: number; tokensOut?: number; cost?: number },
) {
  await q(
    `insert into api_usage (day, service, units, calls, tokens_in, tokens_out, cost)
     values (current_date, $1, $2, $3, $4, $5, $6)
     on conflict (day, service) do update set
       units = api_usage.units + excluded.units, calls = api_usage.calls + excluded.calls,
       tokens_in = api_usage.tokens_in + excluded.tokens_in, tokens_out = api_usage.tokens_out + excluded.tokens_out,
       cost = api_usage.cost + excluded.cost`,
    [service, u.units ?? 0, u.calls ?? 1, u.tokensIn ?? 0, u.tokensOut ?? 0, u.cost ?? 0],
  );
}

export async function youtubeUnitsToday(): Promise<number> {
  const r = await q1<{ units: number }>("select units from api_usage where day = current_date and service = 'youtube'");
  return r?.units ?? 0;
}

export const youtubeBudget = () => Number(env("YOUTUBE_DAILY_UNIT_BUDGET", "8000"));

export async function tavilyCreditsThisMonth(): Promise<number> {
  const r = await q1<{ units: number }>(
    "select coalesce(sum(units), 0)::int as units from api_usage where service = 'tavily' and day >= date_trunc('month', current_date)",
  );
  return r?.units ?? 0;
}

export const tavilyBudget = () => Number(env("TAVILY_MONTHLY_BUDGET", "900"));
