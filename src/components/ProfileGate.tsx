"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Profile = { id: number; name: string; hasPin: boolean; unlocked: boolean };

/** Picks the active profile and asks for its PIN when it is locked. Children only render once unlocked. */
export default function ProfileGate({ children }: { children: (profileId: number, name: string) => React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [who, setWho] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    const r = await api<{ profiles: Profile[] }>("/api/profiles");
    setProfiles(r.profiles);
    let saved: number | null = null;
    try { saved = Number(localStorage.getItem("pp_profile")) || null; } catch {}
    setWho((w) => w ?? (r.profiles.find((p) => p.id === saved) ?? r.profiles[0])?.id ?? null);
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  function choose(id: number) {
    setWho(id);
    setErr("");
    try { localStorage.setItem("pp_profile", String(id)); } catch {}
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api(`/api/profiles/${who}/unlock`, { pin });
      setPin("");
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (!profiles) return <p style={{ color: "var(--muted)" }}>{err || "Loading…"}</p>;
  const me = profiles.find((p) => p.id === who);
  if (!me) return <p>No profile yet. <a className="underline" href="/setup?slot=1">Set one up</a>.</p>;
  const locked = me.hasPin && !me.unlocked;

  return (
    <div className="space-y-5">
      {profiles.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <button key={p.id} className="chip" aria-pressed={who === p.id} onClick={() => choose(p.id)}>
              {p.name}{p.hasPin && !p.unlocked ? " 🔒" : ""}
            </button>
          ))}
        </div>
      )}
      {locked ? (
        <form onSubmit={unlock} className="card max-w-sm space-y-3 p-4">
          <label className="label">Enter {me.name}&apos;s PIN</label>
          <input className="field" type="password" inputMode="numeric" maxLength={4} autoFocus value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          {err && <p className="text-red-500">{err}</p>}
          <button className="btn" disabled={pin.length !== 4}>Unlock</button>
        </form>
      ) : (
        children(me.id, me.name)
      )}
    </div>
  );
}
