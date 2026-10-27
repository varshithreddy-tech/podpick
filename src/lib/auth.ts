import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { HttpError, UNLOCK_IDLE_MS, env } from "./config";
import { q, q1 } from "./db";

export const SESSION_COOKIE_NAME = "pp_session";
const UNLOCK_COOKIE = "pp_unlock";
const MAX_PIN_FAILS = 5;
const LOCKOUT_MS = 10 * 60 * 1000;

const key = () => new TextEncoder().encode(env("SESSION_SECRET"));

async function sign(payload: Record<string, unknown>, maxAgeSec: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(key());
}

async function verify(token?: string) {
  if (!token) return null;
  try {
    return (await jwtVerify(token, key())).payload;
  } catch {
    return null;
  }
}

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

// ---- Device (shared app password) ----
export function passwordMatches(input: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(env("APP_PASSWORD"));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setDeviceCookie() {
  const maxAge = 60 * 60 * 24 * 180;
  (await cookies()).set(SESSION_COOKIE_NAME, await sign({ ok: true }, maxAge), cookieOpts(maxAge));
}

export async function requireDevice() {
  const p = await verify((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!p?.ok) throw new HttpError(401, "Not signed in", "no_device");
}

// ---- PINs ----
export function hashPin(pin: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

function pinMatches(pin: string, stored: string) {
  const [saltHex, hashHex] = stored.split(":");
  const h = scryptSync(pin, Buffer.from(saltHex, "hex"), 32);
  return timingSafeEqual(h, Buffer.from(hashHex, "hex"));
}

// ---- Profile unlock (locks again after 30 min idle) ----
type UnlockMap = Record<string, number>;

async function readUnlocks(): Promise<UnlockMap> {
  const p = await verify((await cookies()).get(UNLOCK_COOKIE)?.value);
  return ((p?.u as UnlockMap) ?? {}) as UnlockMap;
}

async function writeUnlocks(u: UnlockMap) {
  (await cookies()).set(UNLOCK_COOKIE, await sign({ u }, 60 * 60 * 24), cookieOpts(60 * 60 * 24));
}

export type Profile = {
  id: number;
  slot: number;
  name: string;
  pin_hash: string | null;
  pin_fails: number;
  locked_until: string | null;
  visibility: string;
};

export async function getProfile(id: number): Promise<Profile> {
  const p = await q1<Profile>("select * from profiles where id = $1", [id]);
  if (!p) throw new HttpError(404, "Profile not found");
  return p;
}

/**
 * The single choke point for private data: returns the profile only if it has no PIN,
 * or its PIN was entered within the last 30 minutes. Refreshes the idle timer.
 * Every route that touches history, ratings or saved items must call this first.
 */
export async function requireProfile(id: number): Promise<Profile> {
  await requireDevice();
  const p = await getProfile(id);
  if (!p.pin_hash) return p;
  const u = await readUnlocks();
  const last = u[String(id)];
  if (!last || Date.now() - last > UNLOCK_IDLE_MS) {
    throw new HttpError(401, `${p.name}'s profile is locked`, "locked");
  }
  u[String(id)] = Date.now();
  await writeUnlocks(u);
  return p;
}

export async function isUnlocked(p: Profile): Promise<boolean> {
  if (!p.pin_hash) return true;
  const last = (await readUnlocks())[String(p.id)];
  return !!last && Date.now() - last <= UNLOCK_IDLE_MS;
}

export async function unlockProfile(id: number, pin: string) {
  await requireDevice();
  const p = await getProfile(id);
  if (!p.pin_hash) return p;
  if (p.locked_until && new Date(p.locked_until).getTime() > Date.now()) {
    throw new HttpError(429, "Too many wrong PINs. Try again in a few minutes.", "pin_locked");
  }
  if (!/^\d{4}$/.test(pin) || !pinMatches(pin, p.pin_hash)) {
    const fails = p.pin_fails + 1;
    const lock = fails >= MAX_PIN_FAILS;
    await q("update profiles set pin_fails = $2, locked_until = $3 where id = $1", [
      id,
      lock ? 0 : fails,
      lock ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null,
    ]);
    throw new HttpError(401, lock ? "Too many wrong PINs. Locked for 10 minutes." : "Wrong PIN", "bad_pin");
  }
  await q("update profiles set pin_fails = 0, locked_until = null where id = $1", [id]);
  const u = await readUnlocks();
  u[String(id)] = Date.now();
  await writeUnlocks(u);
  return p;
}

/**
 * Which of these profiles are open on this device right now (no PIN, or PIN entered within 30 min).
 * Refreshes the idle timer for all of them in a single cookie write.
 */
export async function unlockedAmong(ids: number[]): Promise<number[]> {
  await requireDevice();
  if (!ids.length) return [];
  const rows = await q<Profile>("select * from profiles where id = any($1::int[])", [ids]);
  const u = await readUnlocks();
  const ok: number[] = [];
  let changed = false;
  for (const p of rows) {
    if (!p.pin_hash) {
      ok.push(p.id);
      continue;
    }
    const last = u[String(p.id)];
    if (last && Date.now() - last <= UNLOCK_IDLE_MS) {
      u[String(p.id)] = Date.now();
      changed = true;
      ok.push(p.id);
    }
  }
  if (changed) await writeUnlocks(u);
  return ok;
}
