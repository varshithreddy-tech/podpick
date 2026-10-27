"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtLength } from "@/lib/client";
import FeedbackBar, { type FbState } from "@/components/FeedbackBar";

type PickT = {
  rank: number;
  reason: string;
  item: { id: number; format: string; url: string; title: string; thumbnail: string | null; source_name: string; duration_sec: number | null; read_min: number | null };
};
type Res = { picks: PickT[]; message: string | null; notes: string[]; participants: { profileId: number; name: string }[] };

const FORMAT_LABEL: Record<string, string> = { watch: "Watch", listen: "Listen", read: "Read" };

export default function Picks({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState("");
  const [fb, setFb] = useState<Record<string, FbState> | null>(null);

  useEffect(() => {
    api<Res>(`/api/sessions/${id}/recommend`, {})
      .then(async (r) => {
        setRes(r);
        const pid = r.participants[0]?.profileId;
        const ids = r.picks.map((p) => p.item.id).join(",");
        const f = pid && ids ? await api<{ map: Record<string, FbState> }>(`/api/feedback?profileId=${pid}&ids=${ids}`).catch(() => null) : null;
        setFb(f?.map ?? {});
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  function opened(itemId: number) {
    const profileId = res?.participants[0]?.profileId;
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
      <p style={{ color: "var(--muted)" }}>The first ask can take up to half a minute while new videos get checked.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Your picks</h1>
        <Link href="/" className="btn-ghost">New ask</Link>
      </div>
      {res.message && <p className="rounded-xl border p-3 font-medium" style={{ borderColor: "var(--line)" }}>{res.message}</p>}
      {res.notes.map((n) => <p key={n} className="text-sm" style={{ color: "var(--muted)" }}>{n}</p>)}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {res.picks.map((p) => (
          <article key={p.item.id} className="card flex flex-col">
            {p.item.thumbnail && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.item.thumbnail} alt="" className="aspect-video w-full object-cover" />}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h2 className="text-lg font-semibold leading-snug">{p.item.title}</h2>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {p.item.source_name} · {FORMAT_LABEL[p.item.format]} · {fmtLength(p.item)}
              </div>
              <p className="flex-1 text-sm">{p.reason}</p>
              <a className="btn mt-2" href={p.item.url} target="_blank" rel="noopener noreferrer" onClick={() => opened(p.item.id)}>
                Open
              </a>
              {res.participants[0] && fb && (
                <FeedbackBar profileId={res.participants[0].profileId} itemId={p.item.id} sessionId={id} initial={fb[p.item.id]} />
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
