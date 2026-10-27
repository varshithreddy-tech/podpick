"use client";
import { useEffect, useState } from "react";
import { api, fmtLength } from "@/lib/client";
import ProfileGate from "@/components/ProfileGate";
import FeedbackBar from "@/components/FeedbackBar";

type Row = {
  id: number; format: string; url: string; title: string; thumbnail: string | null; source_name: string;
  duration_sec: number | null; read_min: number | null; shown_at: string; mode: string; session_id: string;
  rating: "love" | "dislike" | null; saved: boolean;
};

function History({ profileId }: { profileId: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setRows(null);
    api<{ items: Row[] }>(`/api/history?profileId=${profileId}`).then((r) => setRows(r.items)).catch((e) => setErr(e.message));
  }, [profileId]);

  if (err) return <p className="text-red-500">{err}</p>;
  if (!rows) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  return (
    <>
      <h1 className="text-3xl font-bold">History</h1>
      {!rows.length && <p style={{ color: "var(--muted)" }}>Nothing shown yet.</p>}
      <div className="space-y-3">
        {rows.map((r) => (
          <article key={`${r.session_id}-${r.id}`} className="card flex flex-col gap-3 p-3 sm:flex-row">
            {r.thumbnail && /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.thumbnail} alt="" className="aspect-video w-full rounded-lg object-cover sm:w-48" />}
            <div className="flex-1 space-y-1.5">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold leading-snug underline-offset-2 hover:underline">{r.title}</a>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {r.source_name} · {fmtLength(r)} · {new Date(r.shown_at).toLocaleDateString()}{r.mode === "together" ? " · together" : ""}
              </div>
              <FeedbackBar profileId={profileId} itemId={r.id} sessionId={r.session_id} initial={{ rating: r.rating, saved: r.saved }} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <ProfileGate>{(id) => <History key={id} profileId={id} />}</ProfileGate>;
}
