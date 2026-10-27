import { env } from "./config";
import { recordUsage } from "./usage";

/**
 * Calls Gemini and returns parsed JSON that matches `schema`. Retries once on any failure.
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

async function callOnce<T>(system: string, prompt: string, schema: object): Promise<T> {
  const model = env("GEMINI_MODEL");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();

  const tokensIn = data.usageMetadata?.promptTokenCount ?? 0;
  const tokensOut = (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0);
  const cost =
    (tokensIn / 1e6) * Number(env("GEMINI_PRICE_INPUT_PER_M", "0")) +
    (tokensOut / 1e6) * Number(env("GEMINI_PRICE_OUTPUT_PER_M", "0"));
  await recordUsage("gemini", { calls: 1, tokensIn, tokensOut, cost });

  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned no content");
  return JSON.parse(text) as T;
}
