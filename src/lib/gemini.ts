import { env } from "./config";
import { recordUsage } from "./usage";

/**
 * All AI calls go through the OpenRouter gateway (OPENROUTER_API_KEY) to a Google Gemini Flash model
 * named by GEMINI_MODEL (for example "google/gemini-3.8-flash"; a bare name gets the "google/" prefix).
 * Returns parsed JSON matching `schema` (a JSON Schema object). Retries once on any failure.
 * Throws if both attempts fail; callers must then leave the affected items out.
 */
export async function geminiJson<T>(system: string, prompt: string, schema: object): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callOnce<T>(system, prompt, schema);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function modelId() {
  const m = env("GEMINI_MODEL");
  return m.includes("/") ? m : `google/${m}`;
}

async function callOnce<T>(system: string, prompt: string, schema: object): Promise<T> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env("OPENROUTER_API_KEY")}`,
      "x-title": "PodPick",
    },
    body: JSON.stringify({
      model: modelId(),
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema } },
      usage: { include: true },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();

  const tokensIn = data.usage?.prompt_tokens ?? 0;
  const tokensOut = data.usage?.completion_tokens ?? 0;
  const cost =
    typeof data.usage?.cost === "number"
      ? data.usage.cost
      : (tokensIn / 1e6) * Number(env("GEMINI_PRICE_INPUT_PER_M", "0")) +
        (tokensOut / 1e6) * Number(env("GEMINI_PRICE_OUTPUT_PER_M", "0"));
  await recordUsage("gemini", { calls: 1, tokensIn, tokensOut, cost });

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Model returned no content");
  return JSON.parse(text) as T;
}
