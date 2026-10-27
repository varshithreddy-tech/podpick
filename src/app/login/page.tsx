"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/auth/login", { password });
      router.replace("/");
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-sm space-y-4">
      <h1 className="text-3xl font-bold">PodPick</h1>
      <p style={{ color: "var(--muted)" }}>Enter the app password to continue.</p>
      <input className="field" type="password" autoFocus autoComplete="current-password" placeholder="Password"
        value={password} onChange={(e) => setPassword(e.target.value)} />
      {err && <p className="text-red-500">{err}</p>}
      <button className="btn" disabled={busy || !password}>{busy ? "Checking…" : "Enter"}</button>
    </form>
  );
}
