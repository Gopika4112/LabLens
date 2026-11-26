/**
 * Provider-agnostic LLM access for the serverless proxy. API keys stay server-side.
 *
 * Default: Google Gemini's FREE tier through its OpenAI-compatible endpoint.
 * Also supported, all chosen with env vars (see .env.example):
 *   gemini      GEMINI_API_KEY        free tier (rate-limited; free-tier prompts may be used by Google to improve products)
 *   ollama      OLLAMA_BASE_URL       local, free, offline, private (e.g. a school server)
 *   openrouter  OPENROUTER_API_KEY    ":free" models (≈50 requests/day without credits)
 *   groq        GROQ_API_KEY          free tier
 *   claude      ANTHROPIC_API_KEY     paid, strongest vision
 *   custom      LLM_BASE_URL + LLM_API_KEY   any OpenAI-compatible server
 * LLM_PROVIDER forces a provider; LLM_MODEL overrides its default model.
 */

export type Part = { type: "text"; text: string } | { type: "image"; mediaType: string; data: string };
export interface Msg {
  role: "user" | "assistant";
  content: string | Part[];
}

export type ProviderId = "gemini" | "ollama" | "openrouter" | "groq" | "claude" | "custom";

interface Provider {
  id: ProviderId;
  label: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** small local models get a compact prompt (their context windows are short) */
  compactPrompt: boolean;
}

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined)?.trim() || undefined;

/** Default models: free + image-capable where the provider offers one. Override with LLM_MODEL. */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-3.5-flash-lite",
  ollama: "qwen2.5vl:7b",
  openrouter: "", // required: set LLM_MODEL to a ":free" model id from openrouter.ai/models
  groq: "openai/gpt-oss-120b",
  claude: "claude-opus-5-5",
  custom: "default",
};

export function provider(): Provider | null {
  const forced = env("LLM_PROVIDER") as ProviderId | undefined;
  const pick = (id: ProviderId): Provider | null => {
    const model = env("LLM_MODEL") ?? DEFAULT_MODELS[id];
    switch (id) {
      case "gemini":
        return env("GEMINI_API_KEY")
          ? {
              id,
              label: "Gemini (free tier)",
              baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
              apiKey: env("GEMINI_API_KEY"),
              model,
              compactPrompt: false,
            }
          : null;
      case "ollama":
        return env("OLLAMA_BASE_URL")
          ? { id, label: "Ollama (local)", baseUrl: `${env("OLLAMA_BASE_URL")!.replace(/\/$/, "")}/v1`, model, compactPrompt: true }
          : null;
      case "openrouter":
        return env("OPENROUTER_API_KEY") && model
          ? { id, label: "OpenRouter (free models)", baseUrl: "https://openrouter.ai/api/v1", apiKey: env("OPENROUTER_API_KEY"), model, compactPrompt: false }
          : null;
      case "groq":
        return env("GROQ_API_KEY")
          ? { id, label: "Groq (free tier)", baseUrl: "https://api.groq.com/openai/v1", apiKey: env("GROQ_API_KEY"), model, compactPrompt: false }
          : null;
      case "claude":
        return env("ANTHROPIC_API_KEY")
          ? { id, label: "Claude", baseUrl: "https://api.anthropic.com", apiKey: env("ANTHROPIC_API_KEY"), model, compactPrompt: false }
          : null;
      case "custom":
        return env("LLM_BASE_URL")
          ? {
              id,
              label: "Custom",
              baseUrl: env("LLM_BASE_URL")!.replace(/\/$/, ""),
              apiKey: env("LLM_API_KEY"),
              model,
              compactPrompt: env("LLM_COMPACT_PROMPT") === "1",
            }
          : null;
    }
  };
  if (forced) return pick(forced);
  // free options first
  for (const id of ["gemini", "ollama", "openrouter", "groq", "custom", "claude"] as ProviderId[]) {
    const p = pick(id);
    if (p) return p;
  }
  return null;
}

export const aiConfigured = () => provider() !== null;

export class LlmError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function toOpenAI(m: Msg) {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: m.content.map((p) =>
      p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
    ),
  };
}

function toAnthropic(m: Msg) {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: m.content.map((p) =>
      p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } },
    ),
  };
}

async function readError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: { message?: string } | string };
    return typeof j.error === "string" ? j.error : (j.error?.message ?? `HTTP ${r.status}`);
  } catch {
    return `HTTP ${r.status}`;
  }
}

/** One chat call. Returns the reply text. */
export async function ask(opts: {
  system: string;
  messages: Msg[];
  effort: "low" | "medium" | "high";
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; model: string; provider: string }> {
  const p = provider();
  if (!p) throw new LlmError("No AI provider is configured.", 503);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 55_000);
  try {
    let r: Response;
    if (p.id === "claude") {
      // Claude via the Messages API (raw HTTP keeps this proxy dependency-free)
      r = await fetch(`${p.baseUrl}/v1/messages`, {
        method: "POST",
        signal: ctl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": p.apiKey!,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "server-side-fallback-2026-07-01",
        },
        body: JSON.stringify({
          model: p.model,
          max_tokens: opts.maxTokens ?? 16000,
          fallbacks: "default",
          output_config: { effort: opts.effort },
          system: opts.system,
          messages: opts.messages.map(toAnthropic),
        }),
      });
      if (!r.ok) throw new LlmError(await readError(r), r.status);
      const j = (await r.json()) as { model: string; stop_reason: string; content: { type: string; text?: string }[] };
      if (j.stop_reason === "refusal") throw new LlmError("The AI declined this request.", 422);
      return { text: j.content.map((b) => b.text ?? "").join(""), model: j.model, provider: p.label };
    }
    // every other provider speaks the OpenAI Chat Completions protocol
    r = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}) },
      body: JSON.stringify({
        model: p.model,
        max_tokens: opts.maxTokens ?? 8000,
        temperature: 0.2,
        messages: [{ role: "system", content: opts.system }, ...opts.messages.map(toOpenAI)],
      }),
    });
    if (!r.ok) throw new LlmError(await readError(r), r.status);
    const j = (await r.json()) as { model?: string; choices?: { message?: { content?: string | { text?: string }[] } }[] };
    const c = j.choices?.[0]?.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x.text ?? "").join("") : "";
    if (!text) throw new LlmError("The AI returned an empty reply.", 502);
    return { text, model: j.model ?? p.model, provider: p.label };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new LlmError("The AI took too long to answer.", 504);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function errorMessage(e: unknown): { message: string; status: number } {
  if (e instanceof LlmError) {
    if (e.status === 401 || e.status === 403)
      return { message: "The AI service rejected the API key — check the server's environment variables.", status: 503 };
    if (e.status === 429)
      return { message: "The free AI quota is used up for now — try again later, or type the problem (the offline parser needs no AI).", status: 429 };
    if (e.status === 504) return { message: e.message, status: 504 };
    return { message: `AI service error: ${e.message.slice(0, 200)}`, status: e.status >= 400 && e.status < 600 ? 502 : 500 };
  }
  return { message: (e as Error).message || "Unknown error", status: 500 };
}
