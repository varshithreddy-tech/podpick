export class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

export async function api<T = any>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong", data.code, res.status);
  return data as T;
}

export function fmtLength(item: { duration_sec: number | null; read_min: number | null }) {
  if (item.read_min) return `${item.read_min} min read`;
  const sec = item.duration_sec ?? 0;
  if (sec < 60) return `${sec} sec`;
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${m} min`;
}
