"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import ProfileGate from "@/components/ProfileGate";

type Src = { id: number; name: string; kind: string; thumbnail: string | null; enabled: boolean; origin: string };
type Pub = { id: number; name: string; enabled: boolean; we_subscribe: boolean };

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] items-center gap-2">
      <input type="checkbox" className="h-5 w-5" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function Settings({ profileId, name }: { profileId: number; name: string }) {
  const [newName, setNewName] = useState(name);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [mine, setMine] = useState<Src[]>([]);
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [link, setLink] = useState("");

  async function load() {
    const s = await api<{ mine: Src[]; publications: Pub[] }>(`/api/sources?profileId=${profileId}`);
    setMine(s.mine);
    setPubs(s.publications);
    setTopics((await api<{ topics: string[] }>("/api/topics")).topics);
  }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [profileId]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg("");
    try { await fn(); setMsg(ok); await load(); } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Settings</h1>
      {msg && <p className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>{msg}</p>}

      <section className="card space-y-4 p-4">
        <h2 className="text-xl font-semibold">Profile</h2>
        <div>
          <label className="label">Name</label>
          <div className="flex gap-2">
            <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn-ghost" onClick={() => run(() => api(`/api/profiles/${profileId}`, { name: newName }, "PATCH"), "Name saved")}>Save</button>
          </div>
        </div>
        <div>
          <label className="label">PIN (4 digits). Protects this profile&apos;s history, ratings and saved list.</label>
          <div className="flex gap-2">
            <input className="field" inputMode="numeric" maxLength={4} value={pin} placeholder="New PIN"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            <button className="btn-ghost" disabled={pin.length !== 4}
              onClick={() => run(async () => { await api(`/api/profiles/${profileId}`, { pin }, "PATCH"); setPin(""); }, "PIN saved")}>Set</button>
            <button className="btn-ghost" onClick={() => run(() => api(`/api/profiles/${profileId}`, { pin: null }, "PATCH"), "PIN removed")}>Remove</button>
          </div>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-xl font-semibold">{name}&apos;s taste sources</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>These only tell PodPick what you like. They get no ranking boost.</p>
        {mine.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2" style={{ borderColor: "var(--line)" }}>
            <span className="font-medium">{s.name}</span>
            <div className="flex items-center gap-3">
              <Toggle on={s.enabled} label="On" onChange={(v) => run(() => api(`/api/sources/${s.id}`, { enabled: v }, "PATCH"), "Saved")} />
              <button className="btn-ghost !min-h-[40px]" onClick={() => run(() => fetch(`/api/profiles/${profileId}/sources?sourceId=${s.id}`, { method: "DELETE" }), "Removed")}>Remove</button>
            </div>
          </div>
        ))}
        <form className="flex gap-2 pt-2" onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const { candidates } = await api<{ candidates: { channelId: string; title: string; thumbnail: string }[] }>(`/api/sources/resolve?link=${encodeURIComponent(link)}`);
            const c = candidates[0];
            await api(`/api/profiles/${profileId}/sources`, { channelId: c.channelId, title: c.title, thumbnail: c.thumbnail, origin: "added" });
            setLink("");
          }, "Source added");
        }}>
          <input className="field" placeholder="Paste a YouTube channel or video link" value={link} onChange={(e) => setLink(e.target.value)} />
          <button className="btn-ghost" disabled={!link}>Add</button>
        </form>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-xl font-semibold">Paywalled publications</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>A paywalled source is only used when &ldquo;We subscribe&rdquo; is on.</p>
        {pubs.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2" style={{ borderColor: "var(--line)" }}>
            <span className="font-medium">{p.name}</span>
            <div className="flex gap-4">
              <Toggle on={p.enabled} label="On" onChange={(v) => run(() => api(`/api/sources/${p.id}`, { enabled: v }, "PATCH"), "Saved")} />
              <Toggle on={p.we_subscribe} label="We subscribe" onChange={(v) => run(() => api(`/api/sources/${p.id}`, { we_subscribe: v }, "PATCH"), "Saved")} />
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-xl font-semibold">Topics</h2>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <span key={t} className="chip flex items-center gap-2">
              {t}
              <button aria-label={`Remove ${t}`} onClick={() => run(() => api("/api/topics", { topics: topics.filter((x) => x !== t) }, "PUT"), "Topics saved")}>×</button>
            </span>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          run(async () => { await api("/api/topics", { topics: [...topics, newTopic] }, "PUT"); setNewTopic(""); }, "Topics saved");
        }}>
          <input className="field" placeholder="Add a topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
          <button className="btn-ghost" disabled={!newTopic.trim()}>Add</button>
        </form>
      </section>
    </div>
  );
}

export default function Page() {
  return <ProfileGate>{(id, name) => <Settings key={id} profileId={id} name={name} />}</ProfileGate>;
}
