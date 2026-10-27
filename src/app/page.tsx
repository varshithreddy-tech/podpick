"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Profile = { id: number; name: string; hasPin: boolean; unlocked: boolean };
type Cfg = { moods: string[]; topics: string[]; timeSlots: { key: string; label: string }[] };

export default function Ask() {
  const router = useRouter();
  const askId = useRef<string>("");
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [who, setWho] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [mood, setMood] = useState("");
  const [topic, setTopic] = useState("");
  const [time, setTime] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadProfiles() {
    const r = await api<{ profiles: Profile[] }>("/api/profiles");
    setProfiles(r.profiles);
    if (!r.profiles.length) router.replace("/setup?slot=1");
    else setWho((w) => w ?? r.profiles[0].id);
  }

  useEffect(() => {
    askId.current = crypto.randomUUID();
    api("/api/events", { type: "ask_opened", askId: askId.current }).catch(() => {});
    loadProfiles().catch((e) => setErr(e.message));
    api<Cfg>("/api/config").then(setCfg).catch((e) => setErr(e.message));
  }, []);

  const me = profiles?.find((p) => p.id === who);
  const locked = !!me && me.hasPin && !me.unlocked;

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api(`/api/profiles/${who}/unlock`, { pin });
      setPin("");
      await loadProfiles();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function go() {
    setBusy(true);
    setErr("");
    try {
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", {
        askId: askId.current,
        format: "any",
        participants: [{ profileId: who, mood, topic, time }],
      });
      router.push(`/picks/${sessionId}`);
    } catch (e: any) {
      setErr(e.code === "locked" ? "Unlock your profile first" : e.message);
      setBusy(false);
      loadProfiles().catch(() => {});
    }
  }

  if (!profiles || !cfg) return <p style={{ color: "var(--muted)" }}>{err || "Loading…"}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">What are we watching?</h1>

      <section>
        <div className="label">Who&apos;s listening?</div>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <button key={p.id} className="chip" aria-pressed={who === p.id} onClick={() => setWho(p.id)}>
              {p.name}{p.hasPin && !p.unlocked ? " 🔒" : ""}
            </button>
          ))}
        </div>
      </section>

      {locked ? (
        <form onSubmit={unlock} className="card max-w-sm space-y-3 p-4">
          <label className="label">Enter {me!.name}&apos;s PIN</label>
          <input className="field" type="password" inputMode="numeric" maxLength={4} autoFocus value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <button className="btn" disabled={pin.length !== 4}>Unlock</button>
        </form>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Mood" value={mood} onChange={setMood} options={cfg.moods.map((m) => [m, m])} />
            <Select label="Topic" value={topic} onChange={setTopic} options={cfg.topics.map((t) => [t, t])} />
            <Select label="Time" value={time} onChange={setTime} options={cfg.timeSlots.map((t) => [t.key, t.label])} />
          </div>
          <button className="btn sm:max-w-xs" disabled={busy || who == null} onClick={go}>
            {busy ? "One moment…" : "Find my 5 picks"}
          </button>
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
