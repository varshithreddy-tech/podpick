"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type P = { profileId: number; name: string; mood: string | null; topic: string | null; time: string | null; ready: boolean };
type Lobby = { id: string; status: string; joinCode: string | null; pair: boolean; mine: number[]; participants: P[] };

/** Waiting room for "Both": starts by itself as soon as the other person has chosen on their phone. */
export default function Together({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [err, setErr] = useState("");
  const [gone, setGone] = useState(false);

  const poll = useCallback(async () => {
    try {
      const l = await api<Lobby>(`/api/sessions/${id}`);
      setLobby(l);
      if (l.status === "expired") setGone(true);
      else if (l.status !== "open" || (l.participants.length >= 2 && l.participants.every((p) => p.ready))) router.replace(`/picks/${id}`);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [id, router]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [poll]);

  async function cancel() {
    await api(`/api/sessions/${id}/cancel`, {}).catch(() => {});
    router.replace("/");
  }

  if (gone) return (
    <div className="space-y-4">
      <p>This session was cancelled or timed out.</p>
      <button className="btn sm:max-w-xs" onClick={() => router.replace("/")}>Back to Ask</button>
    </div>
  );
  if (!lobby) return <p style={{ color: "var(--muted)" }}>{err || "Loading…"}</p>;

  const others = lobby.participants.filter((p) => !lobby.mine.includes(p.profileId));
  return (
    <div className="mx-auto max-w-xl space-y-6 pt-6 text-center">
      <h1 className="text-3xl font-bold">Together</h1>
      <div className="space-y-2">
        {lobby.participants.map((p) => (
          <div key={p.profileId} className="card flex items-center justify-between p-3">
            <span className="font-semibold">{p.name}</span>
            <span style={{ color: p.ready ? "var(--accent)" : "var(--muted)" }}>{p.ready ? "Ready ✓" : "Choosing…"}</span>
          </div>
        ))}
      </div>
      {lobby.participants.length < 2 && (
        <div className="space-y-2">
          <p className="text-xl font-semibold">Waiting for the other person…</p>
          <p style={{ color: "var(--muted)" }}>
            They need to open PodPick on their phone, tap <b>Both</b>, choose their options and tap the button. Picks start by themselves.
          </p>
        </div>
      )}
      {lobby.participants.length >= 2 && others.length > 0 && <p style={{ color: "var(--muted)" }}>Both ready. Finding picks…</p>}
      <button className="btn-ghost sm:max-w-xs" onClick={cancel}>Cancel</button>
      {err && <p className="text-red-500">{err}</p>}
    </div>
  );
}
