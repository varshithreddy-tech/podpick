"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Week = { week: string; shown: number; rated: number };
type Stats = {
  byPerson: { profileId: number; name: string; weeks: Week[] }[];
  together: Week[];
  medianSecondsToOpen: number | null;
  medianSample: number;
  usage: {
    youtubeUnitsToday: number; youtubeBudget: number; tavilyCreditsMonth: number; tavilyBudget: number;
    gemini: { calls_today: number; cost_today: number; calls_month: number; cost_month: number; tin: number; tout: number };
  };
};

const pct = (w: Week) => (w.shown ? Math.round((w.rated / w.shown) * 100) : 0);
const fmtTime = (s: number | null) => (s == null ? "No data yet" : s < 60 ? `${Math.round(s)} sec` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} sec`);

function WeekTable({ title, weeks }: { title: string; weeks: Week[] }) {
  return (
    <div className="card p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {!weeks.length && <p style={{ color: "var(--muted)" }}>Nothing shown yet.</p>}
      {weeks.map((w) => (
        <div key={w.week} className="mb-2">
          <div className="flex justify-between text-sm">
            <span>Week of {w.week}</span>
            <span>{pct(w)}% · {w.rated} of {w.shown} rated</span>
          </div>
          <div className="mt-1 h-2 rounded-full" style={{ background: "var(--line)" }}>
            <div className="h-2 rounded-full" style={{ width: `${pct(w)}%`, background: "var(--accent)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-sm" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

export default function StatsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<Stats>("/api/stats").then(setS).catch((e) => setErr(e.message)); }, []);

  if (err) return <p className="text-red-500">{err}</p>;
  if (!s) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  const u = s.usage;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Stats</h1>

      <section className="grid gap-4 sm:grid-cols-2">
        <Tile label="Median time from Ask screen to first Open" value={fmtTime(s.medianSecondsToOpen)} sub={`Goal: under 2 minutes · ${s.medianSample} asks measured`} />
        <Tile label="YouTube units today" value={`${u.youtubeUnitsToday.toLocaleString()} / ${u.youtubeBudget.toLocaleString()}`} sub="Searches stop at the budget" />
        <Tile label="Tavily credits this month" value={`${u.tavilyCreditsMonth} / ${u.tavilyBudget}`} sub="Free tier is 1,000 a month" />
        <Tile label="Gemini this month" value={`${u.gemini.calls_month} calls · $${u.gemini.cost_month.toFixed(4)}`}
          sub={`Today: ${u.gemini.calls_today} calls, $${u.gemini.cost_today.toFixed(4)} · ${Math.round(u.gemini.tin / 1000)}k tokens in, ${Math.round(u.gemini.tout / 1000)}k out`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Watch rate (rated ÷ shown), by week</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>Per-person numbers only show for profiles unlocked on this device.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {s.byPerson.map((p) => <WeekTable key={p.profileId} title={p.name} weeks={p.weeks} />)}
          <WeekTable title="Together" weeks={s.together} />
        </div>
      </section>
    </div>
  );
}
