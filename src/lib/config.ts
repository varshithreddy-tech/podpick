export const MOODS = ["Learn something", "Laugh", "Chill", "Inspiring"] as const;

export const DEFAULT_TOPICS = [
  "Startup growth stories",
  "Pharma retail industry",
  "Personality development / self-improvement",
  "Communication",
];

// Time slots in seconds. Lower bound inclusive, upper bound exclusive.
export const TIME_SLOTS = [
  { key: "u10", label: "Under 10 min", min: 0, max: 600 },
  { key: "u30", label: "Under 30 min", min: 0, max: 1800 },
  { key: "30-60", label: "30–60 min", min: 1800, max: 3600 },
  { key: "60-90", label: "60–90 min", min: 3600, max: 5400 },
  { key: "90+", label: "90+ min", min: 5400, max: 1_000_000 },
] as const;
export type TimeKey = (typeof TIME_SLOTS)[number]["key"];

// Clips, shorts and highlights are allowed; only near-empty items (under 30 seconds) are dropped.
export const MIN_DURATION_SEC = 30;
export const LIBRARY_TARGET = 30;
export const MIN_SCORE = 6;
export const MAX_PICKS = 5;
export const SOURCE_PENALTY = 2;
export const UNLOCK_IDLE_MS = 30 * 60 * 1000;

export const STARTER_SOURCES: Record<number, string[]> = {
  1: ["Nikhil Kamath", "Raj Shamani", "Y Combinator", "Think School"],
  2: ["Nikhil Kamath", "Raj Shamani", "The Barbershop with Shantanu"],
};

// Search keywords used for discovery. Unknown (user-added) topics fall back to "<topic> podcast".
export const TOPIC_QUERIES: Record<string, string[]> = {
  "Startup growth stories": ["startup founder growth story podcast", "how we scaled our startup interview"],
  "Pharma retail industry": ["PharmEasy", "Apollo Pharmacy", "MedPlus", "Tata 1mg", "pharma retail India"],
  "Personality development / self-improvement": ["self improvement podcast", "personal development conversation"],
  Communication: ["communication skills podcast", "how to communicate better conversation"],
};

export const MOOD_QUERIES: Record<string, string> = {
  "Learn something": "educational long form podcast",
  Laugh: "funny podcast full episode",
  Chill: "relaxed conversation podcast",
  Inspiring: "inspiring story podcast",
};

export function slotByKey(key?: string | null) {
  return TIME_SLOTS.find((s) => s.key === key) ?? null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new HttpError(500, `${name} is not set`);
}
