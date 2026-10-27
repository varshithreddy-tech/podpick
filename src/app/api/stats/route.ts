import { handle } from "@/lib/http";
import { requireDevice, unlockedAmong } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { tavilyBudget, tavilyCreditsThisMonth, youtubeBudget, youtubeUnitsToday } from "@/lib/usage";

type Week = { week: string; shown: number; rated: number };

export async function GET() {
  return handle(async () => {
    await requireDevice();
    const profiles = await q<{ id: number; name: string }>("select id, name from profiles order by slot");
    const open = await unlockedAmong(profiles.map((p) => p.id));

    // Watch rate = rated / shown. Per-person numbers only appear for profiles unlocked on this device.
    const person = await q<{ wk: string; profile_id: number; shown: number; rated: number }>(
      `select date_trunc('week', r.shown_at)::date::text as wk, sp.profile_id, count(*)::int as shown,
              (count(*) filter (where exists (select 1 from feedback f where f.profile_id = sp.profile_id and f.item_id = r.item_id and f.value in ('love','dislike'))))::int as rated
       from recommendations r join session_participants sp on sp.session_id = r.session_id
       where sp.profile_id = any($1::int[])
       group by 1, 2 order by 1 desc`,
      [open],
    );
    const together = await q<{ wk: string; shown: number; rated: number }>(
      `select date_trunc('week', r.shown_at)::date::text as wk, count(*)::int as shown,
              (count(*) filter (where exists (select 1 from feedback f where f.profile_id = sp.profile_id and f.item_id = r.item_id and f.value in ('love','dislike'))))::int as rated
       from recommendations r
       join sessions s on s.id = r.session_id and s.mode = 'together'
       join session_participants sp on sp.session_id = s.id
       where s.id in (select session_id from session_participants where profile_id = any($1::int[]))
       group by 1 order by 1 desc`,
      [open],
    );

    const byPerson = profiles
      .filter((p) => open.includes(p.id))
      .map((p) => ({
        profileId: p.id,
        name: p.name,
        weeks: person.filter((r) => r.profile_id === p.id).map((r): Week => ({ week: r.wk, shown: r.shown, rated: r.rated })),
      }));

    const median = await q1<{ median_secs: number | null; n: number }>(
      `select percentile_cont(0.5) within group (order by secs) as median_secs, count(*)::int as n from (
         select extract(epoch from (min(o.created_at) - min(a.created_at))) as secs
         from events a join events o on o.ask_id = a.ask_id and o.type = 'item_opened' and o.created_at >= a.created_at
         where a.type = 'ask_opened' group by a.ask_id) t`,
    );

    const gemini = await q1<{ calls_today: number; cost_today: number; calls_month: number; cost_month: number; tin: number; tout: number }>(
      `select coalesce(sum(calls) filter (where day = current_date), 0)::int as calls_today,
              coalesce(sum(cost) filter (where day = current_date), 0)::float as cost_today,
              coalesce(sum(calls), 0)::int as calls_month, coalesce(sum(cost), 0)::float as cost_month,
              coalesce(sum(tokens_in), 0)::bigint::float as tin, coalesce(sum(tokens_out), 0)::bigint::float as tout
       from api_usage where service = 'gemini' and day >= date_trunc('month', current_date)`,
    );

    return {
      byPerson,
      together: together.map((r): Week => ({ week: r.wk, shown: r.shown, rated: r.rated })),
      medianSecondsToOpen: median?.median_secs ?? null,
      medianSample: median?.n ?? 0,
      usage: {
        youtubeUnitsToday: await youtubeUnitsToday(),
        youtubeBudget: youtubeBudget(),
        tavilyCreditsMonth: await tavilyCreditsThisMonth(),
        tavilyBudget: tavilyBudget(),
        gemini,
      },
    };
  });
}
