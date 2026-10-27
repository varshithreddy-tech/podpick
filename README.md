# PodPick

Picks 5 things you will actually watch, listen to or read. Build step 1 (solo, YouTube only) is in place.

## Run it

1. Fill in `.env.local` (see `.env.example`). `DATABASE_URL` is the Neon pooled connection string.
2. `npm run migrate` applies `migrations/001_init.sql` (all tables, including ones used by later steps).
3. `npm run seed` adds the default topics plus The Ken and The Morning Context.
4. `npm run dev`, open http://localhost:3000, enter `APP_PASSWORD`, set up the profile, confirm starter channels.

## Where the rules live

- `src/lib/library.ts` hard filters (format, length, language, checked, source, never-repeat) and the fetch-only-when-thin rule.
- `src/lib/itemCheck.ts` Gemini step 1 (once per new item).
- `src/lib/rank.ts` Gemini step 2, the -2 source penalty, the 6+ cut-off and the lower-of-two rule.
- `src/lib/auth.ts` app password, PIN hashing and throttling, 30-minute profile lock (`requireProfile` guards all private data).
- `src/lib/usage.ts` and `src/lib/sources/youtube.ts` quota tracking and the daily unit budget.
