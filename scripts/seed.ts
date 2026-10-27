import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set in .env.local");
const sql = neon(url);

const TOPICS = [
  "Startup growth stories",
  "Pharma retail industry",
  "Personality development / self-improvement",
  "Communication",
];

async function main() {
  await sql.query(
    "insert into settings (key, value) values ('topics', $1::jsonb) on conflict (key) do nothing",
    [JSON.stringify(TOPICS)],
  );
  // Read sources. The Ken: both subscribe. The Morning Context: paywalled, off until "We subscribe" is switched on.
  await sql.query(
    `insert into sources (kind, external_id, name, url, paywalled, enabled, we_subscribe) values
      ('publication', 'the-ken.com', 'The Ken', 'https://the-ken.com', true, true, true),
      ('publication', 'themorningcontext.com', 'The Morning Context', 'https://themorningcontext.com', true, true, false)
     on conflict (kind, external_id) do nothing`,
  );
  console.log("Seeded topics and publication sources.");
}
main().catch((e) => { console.error(e); process.exit(1); });
