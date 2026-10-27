"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";

type Cand = { channelId: string; title: string; thumbnail: string; handle?: string };
type Row = { name: string; cands: Cand[] | null; chosen: string | null; done: boolean; error?: string };

function Setup() {
  const router = useRouter();
  const slot = Number(useSearchParams().get("slot") ?? 1) === 2 ? 2 : 1;
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(slot === 1 ? "Varshith" : "");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [link, setLink] = useState("");
  const [linkMsg, setLinkMsg] = useState("");

  async function createProfile(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const r = await api<{ id: number }>("/api/setup", { slot, name, pin: pin || undefined });
      setProfileId(r.id);
      const cfg = await api("/api/config");
      const names: string[] = cfg.starterSources[slot];
      setRows(names.map((n) => ({ name: n, cands: null, chosen: null, done: false })));
      setStep(2);
      names.forEach(async (n, i) => {
        try {
          const { candidates } = await api<{ candidates: Cand[] }>(`/api/sources/resolve?q=${encodeURIComponent(n)}`);
          setRows((rs) => rs.map((r, j) => (j === i ? { ...r, cands: candidates, chosen: candidates[0]?.channelId ?? null } : r)));
        } catch (e: any) {
          setRows((rs) => rs.map((r, j) => (j === i ? { ...r, cands: [], error: e.message } : r)));
        }
      });
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function confirm(i: number) {
    const row = rows[i];
    const c = row.cands?.find((x) => x.channelId === row.chosen);
    if (!c || profileId == null) return;
    await api(`/api/profiles/${profileId}/sources`, { channelId: c.channelId, title: c.title, thumbnail: c.thumbnail, origin: "starter" });
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, done: true } : r)));
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkMsg("");
    try {
      const { candidates } = await api<{ candidates: Cand[] }>(`/api/sources/resolve?link=${encodeURIComponent(link)}`);
      const c = candidates[0];
      await api(`/api/profiles/${profileId}/sources`, { channelId: c.channelId, title: c.title, thumbnail: c.thumbnail, origin: "added" });
      setLinkMsg(`Added ${c.title}`);
      setLink("");
    } catch (e: any) {
      setLinkMsg(e.message);
    }
  }

  if (step === 1) {
    return (
      <form onSubmit={createProfile} className="mx-auto max-w-sm space-y-4">
        <h1 className="text-3xl font-bold">{slot === 1 ? "Set up your profile" : "Set up the second profile"}</h1>
        <div>
          <label className="label">Name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">4-digit PIN (optional)</label>
          <input className="field" inputMode="numeric" maxLength={4} value={pin} placeholder="Leave empty for no PIN"
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>The PIN protects this profile&apos;s history, ratings and saved list.</p>
        </div>
        {err && <p className="text-red-500">{err}</p>}
        <button className="btn" disabled={!name.trim() || (pin.length > 0 && pin.length !== 4)}>Continue</button>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-3xl font-bold">Confirm your starter sources</h1>
      <p style={{ color: "var(--muted)" }}>
        These only tell PodPick what you like. They don&apos;t get a ranking boost. Pick the exact channel for each.
      </p>
      {rows.map((r, i) => (
        <div key={r.name} className="card p-4 space-y-3">
          <div className="font-semibold">{r.name}</div>
          {r.cands === null && <p style={{ color: "var(--muted)" }}>Searching…</p>}
          {r.error && <p className="text-red-500">{r.error}. You can add it by link below.</p>}
          {r.cands?.map((c) => (
            <label key={c.channelId} className="flex items-center gap-3 rounded-xl border p-2" style={{ borderColor: "var(--line)" }}>
              <input type="radio" name={`r${i}`} checked={r.chosen === c.channelId} disabled={r.done}
                onChange={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, chosen: c.channelId } : x)))} />
              {c.thumbnail && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.thumbnail} alt="" className="h-10 w-10 rounded-full" />}
              <span>{c.title}</span>
            </label>
          ))}
          {r.cands && r.cands.length > 0 && (
            <button className="btn-ghost w-full" disabled={r.done || !r.chosen} onClick={() => confirm(i)}>
              {r.done ? "Confirmed ✓" : "Confirm this channel"}
            </button>
          )}
        </div>
      ))}
      <form onSubmit={addLink} className="card p-4 space-y-3">
        <label className="label">Add another by pasting a YouTube link</label>
        <input className="field" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/@channel" />
        {linkMsg && <p style={{ color: "var(--muted)" }}>{linkMsg}</p>}
        <button className="btn-ghost w-full" disabled={!link}>Add</button>
      </form>
      <button className="btn" onClick={() => router.replace("/")}>Done</button>
    </div>
  );
}

export default function Page() {
  return <Suspense><Setup /></Suspense>;
}
