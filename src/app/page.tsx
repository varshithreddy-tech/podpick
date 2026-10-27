"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Profile = { id: number; name: string; hasPin: boolean; unlocked: boolean };
type Cfg = { moods: string[]; topics: string[]; timeSlots: { key: string; label: string }[] };
type Fields = { mood: string; topic: string; time: string };
const EMPTY: Fields = { mood: "", topic: "", time: "" };
const BOTH = -1;

export default function Ask() {
  const router = useRouter();
  const askId = useRef<string>("");
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [who, setWho] = useState<number | null>(null);
  const [fields, setFields] = useState<Record<number, Fields>>({});
  const [format, setFormat] = useState("any");
  const [pins, setPins] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadProfiles() {
    const r = await api<{ profiles: Profile[] }>("/api/profiles");
    setProfiles(r.profiles);
    if (!r.profiles.length) router.replace("/setup?slot=1");
    else
      setWho((w) => {
        if (w != null) return w;
        let saved: number | null = null;
        try { saved = Number(localStorage.getItem("pp_profile")) || null; } catch {}
        return r.profiles.find((p) => p.id === saved)?.id ?? r.profiles[0].id;
      });
  }

  useEffect(() => {
    askId.current = crypto.randomUUID();
    api("/api/events", { type: "ask_opened", askId: askId.current }).catch(() => {});
    loadProfiles().catch((e) => setErr(e.message));
    api<Cfg>("/api/config").then(setCfg).catch((e) => setErr(e.message));
  }, []);

  if (!profiles || !cfg || who == null) return <p style={{ color: "var(--muted)" }}>{err || "Loading…"}</p>;

  const selected = who === BOTH ? profiles : profiles.filter((p) => p.id === who);
  const locked = selected.filter((p) => p.hasPin && !p.unlocked);
  const f = (id: number) => fields[id] ?? EMPTY;
  const setF = (id: number, k: keyof Fields, v: string) => setFields((s) => ({ ...s, [id]: { ...f(id), [k]: v } }));

  function choose(id: number) {
    setWho(id);
    setErr("");
    if (id !== BOTH) try { localStorage.setItem("pp_profile", String(id)); } catch {}
  }

  async function unlock(p: Profile, e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api(`/api/profiles/${p.id}/unlock`, { pin: pins[p.id] ?? "" });
      setPins((s) => ({ ...s, [p.id]: "" }));
      await loadProfiles();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function go(mode: "solo" | "together" | "remote") {
    setBusy(true);
    setErr("");
    try {
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", {
        askId: askId.current,
        mode,
        format,
        participants: selected.map((p) => ({ profileId: p.id, ...f(p.id) })),
      });
      router.push(mode === "remote" ? `/together/${sessionId}` : `/picks/${sessionId}`);
    } catch (e: any) {
      setErr(e.code === "locked" ? "Unlock the selected profiles first" : e.message);
      setBusy(false);
      loadProfiles().catch(() => {});
    }
  }

  const block = (p: Profile, title?: string) => (
    <div key={p.id} className="space-y-3">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Mood" value={f(p.id).mood} onChange={(v) => setF(p.id, "mood", v)} options={cfg.moods.map((m) => [m, m])} />
        <Select label="Topic" value={f(p.id).topic} onChange={(v) => setF(p.id, "topic", v)} options={cfg.topics.map((t) => [t, t])} />
        <Select label="Time" value={f(p.id).time} onChange={(v) => setF(p.id, "time", v)} options={cfg.timeSlots.map((t) => [t.key, t.label])} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">What are we watching?</h1>

      <section>
        <div className="label">Who&apos;s listening?</div>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <button key={p.id} className="chip" aria-pressed={who === p.id} onClick={() => choose(p.id)}>
              {p.name}{p.hasPin && !p.unlocked ? " 🔒" : ""}
            </button>
          ))}
          {profiles.length > 1 && (
            <button className="chip" aria-pressed={who === BOTH} onClick={() => choose(BOTH)}>Both</button>
          )}
        </div>
        {profiles.length === 1 && (
          <Link href="/setup?slot=2" className="mt-3 inline-block text-sm underline" style={{ color: "var(--muted)" }}>
            + Add the second profile
          </Link>
        )}
      </section>

      {locked.map((p) => (
        <form key={p.id} onSubmit={(e) => unlock(p, e)} className="card max-w-sm space-y-3 p-4">
          <label className="label">Enter {p.name}&apos;s PIN</label>
          <input className="field" type="password" inputMode="numeric" maxLength={4} value={pins[p.id] ?? ""}
            onChange={(e) => setPins((s) => ({ ...s, [p.id]: e.target.value.replace(/\D/g, "") }))} />
          <button className="btn" disabled={(pins[p.id] ?? "").length !== 4}>Unlock {p.name}</button>
        </form>
      ))}

      {!locked.length && (
        <>
          {who === BOTH ? selected.map((p) => block(p, `${p.name} wants…`)) : block(selected[0])}
          <div className="max-w-xs">
            <Select label={who === BOTH ? "Format (shared)" : "Format"} value={format === "any" ? "" : format} onChange={(v) => setFormat(v || "any")}
              options={[["watch", "Watch"], ["listen", "Listen"], ["read", "Read"]]} />
          </div>
          <div className="flex flex-col gap-3 sm:max-w-xs">
            <button className="btn" disabled={busy} onClick={() => go(who === BOTH ? "together" : "solo")}>
              {busy ? "One moment…" : who === BOTH ? "Find picks for both of us" : "Find my 5 picks"}
            </button>
            {who !== BOTH && profiles.length > 1 && (
              <button className="btn-ghost" disabled={busy} onClick={() => go("remote")}>Ask together on two phones</button>
            )}
            {profiles.length > 1 && <Link href="/join" className="btn-ghost">Join with a code</Link>}
          </div>
        </>
      )}
      {err && <p className="text-red-500">{err}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
