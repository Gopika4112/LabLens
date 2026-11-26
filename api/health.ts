import { json } from "./_lib/http";
import { provider } from "./_lib/llm";

export function GET(): Response {
  const p = provider();
  return json({ ok: true, ai: p !== null, provider: p?.label ?? null, model: p?.model ?? null });
}
