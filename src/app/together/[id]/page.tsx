"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type P = { profileId: number; name: string; mood: string | null; topic: string | null; time: string | null; ready: boolean };
type Lobby = { id: string; status: string; joinCode: string | null; creatorId: number; mine: number[]; participants: P[] };
type Cfg = { moods: string[]; topics: string[]; timeSlots: { key: string; label: string }[] };

export default function Together({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [mood, setMood] = useState("");
  const [topic, setTopic] = useState("");
  const [time, setTime] = useState("");
  const [err, setErr] = useState("");
  const [starting, setStarting] = useState(false);

  const poll = useCallback(async () => {
    try {
      const l = await api<Lobby>(`/api/sessions/${id}`);
      setLobby(l);
      if (l.status !== "open") router.replace(`/picks/${id}`);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [id, router]);

  useEffect(() => {
    api<Cfg>("/api/config").then(setCfg).catch(() => {});
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  if (!lobby || !cfg) return <p style={{ color: "var(--muted)" }}>{err || "Loading…"}</p>;

  const myId = lobby.mine[0];
  const me = lobby.participants.find((p) => p.profileId === myId);
  const everyoneReady = lobby.participants.length >= 2 && lobby.participants.every((p) => p.ready);
  const isCreator = myId === lobby.creatorId;

  async function save(ready: boolean) {
    setErr("");
    try {
      await api(`/api/sessions/${id}/participant`, { profileId: myId, mood, topic, time, ready }, "PATCH");
      await poll();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function start() {
    setStarting(true);
    router.push(`/picks/${id}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-bold">Together</h1>
      {lobby.joinCode && (
        <div className="card p-5 text-center">
          <div className="label">Join code. Enter it on the other phone (Ask → Join with a code)</div>
          <div className="text-5xl font-extrabold tracking-[0.3em]">{lobby.joinCode}</div>
        </div>
      )}

      <div className="space-y-2">
        {lobby.participants.map((p) => (
          <div key={p.profileId} className="card flex items-center justify-between p-3">
            <span className="font-semibold">{p.name}</span>
            <span style={{ color: p.ready ? "var(--accent)" : "var(--muted)" }}>{p.ready ? "Ready ✓" : "Choosing…"}</span>
          </div>
        ))}
        {lobby.participants.length < 2 && <p style={{ color: "var(--muted)" }}>Waiting for the other person to join…</p>}
      </div>

      {me && (
        <div className="card space-y-4 p-4">
          <h2 className="text-lg font-semibold">{me.name}: what do you want right now?</h2>
          <Sel label="Mood" value={mood} onChange={setMood} options={cfg.moods.map((m) => [m, m])} />
          <Sel label="Topic" value={topic} onChange={setTopic} options={cfg.topics.map((t) => [t, t])} />
          <Sel label="Time" value={time} onChange={setTime} options={cfg.timeSlots.map((t) => [t.key, t.label])} />
          <button className="btn" onClick={() => save(true)}>{me.ready ? "Update my choices" : "I'm ready"}</button>
        </div>
      )}

      {isCreator && (
        <button className="btn" disabled={!everyoneReady || starting} onClick={start}>
          {everyoneReady ? "Find picks for both of us" : "Waiting for both people to be ready"}
        </button>
      )}
      {!isCreator && everyoneReady && <p style={{ color: "var(--muted)" }}>Waiting for the other person to start…</p>}
      {err && <p className="text-red-500">{err}</p>}
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
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
