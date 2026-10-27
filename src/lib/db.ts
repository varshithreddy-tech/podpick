import { neon } from "@neondatabase/serverless";
import { env } from "./config";

let _sql: ReturnType<typeof neon> | null = null;

/** Run a parameterised query. Server-only: DATABASE_URL never reaches the browser. */
export async function q<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!_sql) _sql = neon(env("DATABASE_URL"));
  return (await _sql.query(text, params)) as T[];
}

export async function q1<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}
