"use client";
import { useEffect, useRef, useState } from "react";
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
  const [who, setWho] = useState<number | null>(null); // a profile id, or BOTH
  const [me, setMe] = useState<number | null>(null); // which person this phone is, used in Both mode
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [format, setFormat] = useState("any");
  const [pin, setPin] = useState("");
  const [waiting, setWaiting] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadProfiles() {
    const r = await api<{ profiles: Profile[] }>("/api/profiles");
    setProfiles(r.profiles);
    if (!r.profiles.length) return router.replace("/setup?slot=1");
    let saved: number | null = null;
    try { saved = Number(localStorage.getItem("pp_profile")) || null; } catch {}
    const first = r.profiles.find((p) => p.id === saved)?.id ?? r.profiles[0].id;
    setWho((w) => w ?? first);
    setMe((m) => m ?? first);
  }

  useEffect(() => {
    askId.current = crypto.randomUUID();
    api("/api/events", { type: "ask_opened", askId: askId.current }).catch(() => {});
    loadProfiles().catch((e) => setErr(e.message));
    api<Cfg>("/api/config").then(setCfg).catch((e) => setErr(e.message));
  }, []);

  const together = who === BOTH;
  const active = together ? me : who; // the one person whose options this phone is choosing
  const person = profiles?.find((p) => p.id === active);
  const locked = !!person && person.hasPin && !person.unlocked;

  // Tell this person if the other one is already waiting.
  useEffect(() => {
    if (!together || !active || locked) return setWaiting(null);
    let stop = false;
    const check = () => api<{ waiting: string | null }>(`/api/pair?profileId=${active}`).then((r) => !stop && setWaiting(r.waiting)).catch(() => {});
    check();
    const t = setInterval(check, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [together, active, locked]);

  if (!profiles || !cfg || who == null || active == null) return <p style={{ color: "var(--muted)" }}>{err || "Loading…"}</p>;

  const remember = (id: number) => { try { localStorage.setItem("pp_profile", String(id)); } catch {} };
  const set = (k: keyof Fields, v: string) => setFields((s) => ({ ...s, [k]: v }));

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api(`/api/profiles/${active}/unlock`, { pin });
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
        mode: together ? "pair" : "solo",
        format,
        participants: [{ profileId: active, ...fields }],
      });
      remember(active!);
      if (together) {
        // This phone is this person: the picks screen only shows their rating buttons.
        try { localStorage.setItem(`pp_me_${sessionId}`, String(active)); } catch {}
        router.push(`/together/${sessionId}`);
      } else router.push(`/picks/${sessionId}`);
    } catch (e: any) {
      setErr(e.code === "locked" ? "Unlock your profile first" : e.message);
      setBusy(false);
      loadProfiles().catch(() => {});
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">What are we watching?</h1>

      <section>
        <div className="label">Who&apos;s listening?</div>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <button key={p.id} className="chip" aria-pressed={who === p.id} onClick={() => { setWho(p.id); setMe(p.id); setErr(""); remember(p.id); }}>
              {p.name}{p.hasPin && !p.unlocked ? " 🔒" : ""}
            </button>
          ))}
          {profiles.length > 1 && (
            <button className="chip" aria-pressed={together} onClick={() => { setWho(BOTH); setErr(""); }}>Both</button>
          )}
        </div>
      </section>

      {together && (
        <section className="space-y-3">
          <p style={{ color: "var(--muted)" }}>
            Choose your own options here. The other person opens PodPick on their phone, taps <b>Both</b> and chooses theirs.
            You&apos;ll both get the same picks.
          </p>
          <div>
            <div className="label">Which one are you on this phone?</div>
            <div className="flex flex-wrap gap-2">
              {profiles.map((p) => (
                <button key={p.id} className="chip" aria-pressed={me === p.id} onClick={() => { setMe(p.id); setErr(""); }}>
                  I&apos;m {p.name}{p.hasPin && !p.unlocked ? " 🔒" : ""}
                </button>
              ))}
            </div>
          </div>
          {waiting && (
            <p className="rounded-xl border p-3 font-medium" style={{ borderColor: "var(--accent)" }}>
              {waiting} is waiting for you. Choose your options and tap the button to start.
            </p>
          )}
        </section>
      )}

      {locked ? (
        <form onSubmit={unlock} className="card max-w-sm space-y-3 p-4">
          <label className="label">Enter {person!.name}&apos;s PIN</label>
          <input className="field" type="password" inputMode="numeric" maxLength={4} autoFocus value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <button className="btn" disabled={pin.length !== 4}>Unlock {person!.name}</button>
        </form>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Mood" value={fields.mood} onChange={(v) => set("mood", v)} options={cfg.moods.map((m) => [m, m])} />
            <Select label="Topic" value={fields.topic} onChange={(v) => set("topic", v)} options={cfg.topics.map((t) => [t, t])} />
            <Select label="Time" value={fields.time} onChange={(v) => set("time", v)} options={cfg.timeSlots.map((t) => [t.key, t.label])} />
          </div>
          <div className="max-w-xs">
            <Select label={together ? "Format (shared)" : "Format"} value={format === "any" ? "" : format} onChange={(v) => setFormat(v || "any")}
              options={[["watch", "Watch"], ["listen", "Listen"], ["read", "Read"]]} />
          </div>
          <div className="sm:max-w-xs">
            <button className="btn" disabled={busy} onClick={go}>
              {busy ? "One moment…" : together ? "Find picks together" : "Find my 5 picks"}
            </button>
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
