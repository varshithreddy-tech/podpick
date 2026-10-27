"use client";
import { useState } from "react";
import { api } from "@/lib/client";

export type FbState = { rating: "love" | "dislike" | null; saved: boolean };

export default function FeedbackBar({ profileId, itemId, sessionId, initial, label }: {
  profileId: number; itemId: number; sessionId?: string; initial?: FbState; label?: string;
}) {
  const [st, setSt] = useState<FbState>(initial ?? { rating: null, saved: false });
  const [err, setErr] = useState("");

  async function send(value: "love" | "dislike" | "save" | "unsave") {
    const prev = st;
    setErr("");
    setSt(value === "save" ? { ...st, saved: true } : value === "unsave" ? { ...st, saved: false } : { ...st, rating: value });
    try {
      await api("/api/feedback", { profileId, itemId, sessionId, value });
    } catch (e: any) {
      setSt(prev);
      setErr(e.code === "locked" ? "Profile locked. Unlock it and try again." : e.message);
    }
  }

  return (
    <div className="space-y-1.5">
      {label && <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</div>}
      <div className="grid grid-cols-3 gap-2">
        <button className="chip !px-2 text-sm" aria-pressed={st.rating === "love"} onClick={() => send("love")}>👍 Loved it</button>
        <button className="chip !px-2 text-sm" aria-pressed={st.rating === "dislike"} onClick={() => send("dislike")}>👎 Didn&apos;t like</button>
        <button className="chip !px-2 text-sm" aria-pressed={st.saved} onClick={() => send(st.saved ? "unsave" : "save")}>
          {st.saved ? "🔖 Saved" : "🔖 Save"}
        </button>
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
    </div>
  );
}
