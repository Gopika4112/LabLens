/** Provider selection and wire formats of the free-model LLM layer (network mocked). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ask, provider, DEFAULT_MODELS, errorMessage, LlmError } from "./_lib/llm";

const KEYS = ["LLM_PROVIDER", "LLM_MODEL", "GEMINI_API_KEY", "OLLAMA_BASE_URL", "OPENROUTER_API_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY", "LLM_BASE_URL"];
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("is null with no keys (app stays in offline mode)", () => {
    expect(provider()).toBeNull();
  });
  it("prefers the free Gemini tier over paid Claude", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.GEMINI_API_KEY = "g";
    expect(provider()!.id).toBe("gemini");
    expect(provider()!.model).toBe(DEFAULT_MODELS.gemini);
  });
  it("honours LLM_PROVIDER and LLM_MODEL", () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/";
    process.env.LLM_PROVIDER = "ollama";
    process.env.LLM_MODEL = "gemma3:4b";
    const p = provider()!;
    expect(p.baseUrl).toBe("http://localhost:11434/v1");
    expect(p.model).toBe("gemma3:4b");
    expect(p.compactPrompt).toBe(true);
  });
  it("requires an explicit :free model for OpenRouter", () => {
    process.env.OPENROUTER_API_KEY = "o";
    expect(provider()).toBeNull();
    process.env.LLM_MODEL = "some/model:free";
    expect(provider()!.id).toBe("openrouter");
  });
});

describe("wire format", () => {
  it("sends images as OpenAI-style data URLs with a bearer key", async () => {
    process.env.GEMINI_API_KEY = "secret";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ model: "m", choices: [{ message: { content: '{"ok":1}' } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await ask({
      system: "sys",
      effort: "low",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mediaType: "image/jpeg", data: "AAA" },
            { type: "text", text: "hi" },
          ],
        },
      ],
    });
    expect(r.text).toBe('{"ok":1}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.messages[1].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } });
  });
  it("maps quota errors to a friendly message", async () => {
    process.env.GEMINI_API_KEY = "k";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 })),
    );
    await expect(ask({ system: "s", effort: "low", messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(LlmError);
    expect(errorMessage(new LlmError("quota", 429)).message).toMatch(/free AI quota/);
  });
});
