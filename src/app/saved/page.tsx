"use client";
import { useEffect, useState } from "react";
import { api, fmtLength } from "@/lib/client";
import ProfileGate from "@/components/ProfileGate";
import FeedbackBar from "@/components/FeedbackBar";

type Item = { id: number; format: string; url: string; title: string; thumbnail: string | null; source_name: string; duration_sec: number | null; read_min: number | null; summary: string | null };

function SavedList({ profileId, name }: { profileId: number; name: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setItems(null);
    api<{ items: Item[] }>(`/api/saved?profileId=${profileId}`).then((r) => setItems(r.items)).catch((e) => setErr(e.message));
  }, [profileId]);

  function opened(itemId: number) {
    fetch("/api/events", {
      method: "POST", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "item_opened", sessionId: null, itemId, profileId }),
    }).catch(() => {});
  }

  if (err) return <p className="text-red-500">{err}</p>;
  if (!items) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  return (
    <>
      <h1 className="text-3xl font-bold">Saved for later</h1>
      {!items.length && <p style={{ color: "var(--muted)" }}>Nothing saved yet, {name}. Use Save on any pick.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <article key={it.id} className="card flex flex-col">
            {it.thumbnail && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.thumbnail} alt="" className="aspect-video w-full object-cover" />}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h2 className="text-lg font-semibold leading-snug">{it.title}</h2>
              <div className="text-sm" style={{ color: "var(--muted)" }}>{it.source_name} · {fmtLength(it)}</div>
              {it.summary && <p className="flex-1 text-sm">{it.summary}</p>}
              <a className="btn mt-2" href={it.url} target="_blank" rel="noopener noreferrer" onClick={() => opened(it.id)}>Open</a>
              <FeedbackBar profileId={profileId} itemId={it.id} initial={{ rating: null, saved: true }} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export default function Saved() {
  return <ProfileGate>{(id, name) => <SavedList key={id} profileId={id} name={name} />}</ProfileGate>;
}
