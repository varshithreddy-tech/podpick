"use client";
import { useState } from "react";
import { api, fmtLength } from "@/lib/client";

type Clip = { id: number; url: string; title: string; thumbnail: string | null; duration_sec: number | null; source_name: string };

/** Short clips and highlights of a suggested episode, loaded only when asked for. */
export default function Highlights({ sessionId, itemId, onOpen }: { sessionId: string; itemId: number; onOpen: (clipId: number) => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [clips, setClips] = useState<Clip[]>([]);
  const [note, setNote] = useState("");

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (state !== "idle") return;
    setState("loading");
    try {
      const r = await api<{ clips: Clip[]; note?: string }>(`/api/items/${itemId}/highlights`, { sessionId });
      setClips(r.clips);
      setNote(r.note ?? "");
    } catch (e: any) {
      setNote(e.message);
    }
    setState("done");
  }

  return (
    <div className="space-y-2">
      <button className="btn-ghost w-full" onClick={toggle} aria-expanded={open}>
        🎬 {open ? "Hide highlights" : "Highlights"}
      </button>
      {open && (
        <div className="space-y-2">
          {state === "loading" && <p className="text-sm" style={{ color: "var(--muted)" }}>Looking for clips…</p>}
          {clips.map((c) => (
            <a key={c.id} href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(c.id)}
              className="flex gap-3 rounded-xl border p-2" style={{ borderColor: "var(--line)" }}>
              {c.thumbnail && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />}
              <span className="min-w-0 text-sm">
                <span className="line-clamp-2 font-medium">{c.title}</span>
                <span style={{ color: "var(--muted)" }}>{c.source_name} · {fmtLength({ duration_sec: c.duration_sec, read_min: null })}</span>
              </span>
            </a>
          ))}
          {state === "done" && note && <p className="text-sm" style={{ color: "var(--muted)" }}>{note}</p>}
        </div>
      )}
    </div>
  );
}
