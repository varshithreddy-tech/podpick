"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import ProfileGate from "@/components/ProfileGate";

function JoinForm({ profileId, name }: { profileId: number; name: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions/join", { code, profileId });
      router.push(`/together/${sessionId}`);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <form onSubmit={join} className="max-w-sm space-y-4">
      <p style={{ color: "var(--muted)" }}>Joining as {name}. Enter the 4-character code from the other phone.</p>
      <input className="field text-center text-2xl font-bold uppercase tracking-[0.4em]" maxLength={4} autoFocus value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD" />
      {err && <p className="text-red-500">{err}</p>}
      <button className="btn" disabled={code.length !== 4}>Join</button>
    </form>
  );
}

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Join a together session</h1>
      <ProfileGate>{(id, name) => <JoinForm key={id} profileId={id} name={name} />}</ProfileGate>
    </div>
  );
}
