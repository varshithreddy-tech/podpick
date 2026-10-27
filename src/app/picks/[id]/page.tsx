"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtLength } from "@/lib/client";
import FeedbackBar, { type FbState } from "@/components/FeedbackBar";
import Highlights from "@/components/Highlights";

type Item = { id: number; format: string; url: string; title: string; thumbnail: string | null; source_name: string; duration_sec: number | null; read_min: number | null };
type PickT = { rank: number; reason: string; item: Item };
type Res = {
  status: "ok";
  mode: "solo" | "together";
  picks: PickT[];
  message: string | null;
  notes: string[];
  fallbacks?: Record<string, PickT | null>;
  participants: { profileId: number; name: string }[];
  mine: number[];
};

const FORMAT_LABEL: Record<string, string> = { watch: "Watch", listen: "Listen", read: "Read" };
const FORMAT_ICON: Record<string, string> = { watch: "▶", listen: "🎧", read: "📄" };

export default function Picks({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState("");
  const [fb, setFb] = useState<Record<number, Record<string, FbState>>>({});

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        let r = (await api<Res | { status: "running" }>(`/api/sessions/${id}/recommend`, {})) as Res | { status: "running" };
        if (stop) return;
        if (r.status === "running") {
          setTimeout(run, 2500);
          return;
        }
        // On a phone that paired as one person, only that person's rating buttons show.
        let meId: number | null = null;
        try { meId = Number(localStorage.getItem(`pp_me_${id}`)) || null; } catch {}
        if (meId && r.mine.includes(meId)) r = { ...r, mine: [meId] };
        setRes(r);
        const items = [...r.picks.map((p) => p.item.id), ...Object.values(r.fallbacks ?? {}).filter(Boolean).map((p) => p!.item.id)];
        const ids = [...new Set(items)].join(",");
        if (ids) {
          const maps: Record<number, Record<string, FbState>> = {};
          for (const pid of r.mine) {
            const f = await api<{ map: Record<string, FbState> }>(`/api/feedback?profileId=${pid}&ids=${ids}`).catch(() => null);
            maps[pid] = f?.map ?? {};
          }
          if (!stop) setFb(maps);
        }
      } catch (e: any) {
        if (!stop) setErr(e.message);
      }
    }
    run();
    return () => { stop = true; };
  }, [id]);

  function opened(itemId: number) {
    const profileId = res?.mine[0];
    fetch("/api/events", {
      method: "POST", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "item_opened", sessionId: id, itemId, profileId }),
    }).catch(() => {});
  }

  if (err) return (
    <div className="space-y-4">
      <p className="text-red-500">{err}</p>
      <Link href="/" className="btn-ghost">Back</Link>
    </div>
  );
  if (!res) return (
    <div className="space-y-2 pt-10 text-center">
      <p className="text-xl font-semibold">Finding things worth your time…</p>
      <p style={{ color: "var(--muted)" }}>The first ask can take up to half a minute while new items get checked.</p>
    </div>
  );

  const names = new Map(res.participants.map((p) => [p.profileId, p.name]));
  const many = res.mine.length > 1 || res.mode === "together";

  const card = (p: PickT, key: string, tag?: string) => (
    <article key={key} className="card flex flex-col">
      {p.item.thumbnail ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={p.item.thumbnail} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center text-5xl" style={{ background: "var(--line)" }}>
          {FORMAT_ICON[p.item.format]}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {tag && <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{tag}</div>}
        <h2 className="text-lg font-semibold leading-snug">{p.item.title}</h2>
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          {p.item.source_name} · {FORMAT_LABEL[p.item.format]} · {fmtLength(p.item)}
        </div>
        <p className="flex-1 text-sm">{p.reason}</p>
        <a className="btn mt-2" href={p.item.url} target="_blank" rel="noopener noreferrer" onClick={() => opened(p.item.id)}>
          Open
        </a>
        {(p.item.format === "watch" || p.item.format === "listen") && (
          <Highlights sessionId={id} itemId={p.item.id} onOpen={(clipId) => opened(clipId)} />
        )}
        {res.mine.map((pid) => (
          <FeedbackBar key={pid} profileId={pid} itemId={p.item.id} sessionId={id}
            initial={fb[pid]?.[p.item.id]} label={many ? `${names.get(pid)}'s rating` : undefined} />
        ))}
      </div>
    </article>
  );

  const fallbackEntries = Object.entries(res.fallbacks ?? {}).filter(([, v]) => v) as [string, PickT][];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{res.mode === "together" ? "Your picks, together" : "Your picks"}</h1>
        <Link href="/" className="btn-ghost">New ask</Link>
      </div>
      {res.message && <p className="rounded-xl border p-3 font-medium" style={{ borderColor: "var(--line)" }}>{res.message}</p>}
      {res.notes.map((n) => <p key={n} className="text-sm" style={{ color: "var(--muted)" }}>{n}</p>)}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {res.picks.map((p) => card(p, String(p.item.id)))}
      </div>
      {fallbackEntries.length > 0 && (
        <>
          <h2 className="pt-2 text-xl font-semibold">Best pick for each of you</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fallbackEntries.map(([pid, p]) => card(p, `fb-${pid}`, `Best for ${names.get(Number(pid))}`))}
          </div>
        </>
      )}
    </div>
  );
}
