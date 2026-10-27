import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set in .env.local");
const sql = neon(url);

async function main() {
  await sql.query("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await sql.query("select name from _migrations")).map((r) => r.name as string));
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const text = readFileSync(join(dir, file), "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    const statements = text.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
    console.log(`Applying ${file} (${statements.length} statements)`);
    await sql.transaction([
      ...statements.map((s) => sql.query(s)),
      sql.query("insert into _migrations (name) values ($1)", [file]),
    ]);
  }
  console.log("Migrations up to date.");
}
main().catch((e) => { console.error(e); process.exit(1); });
