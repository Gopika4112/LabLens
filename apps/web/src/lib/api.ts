import type { Scene } from "@lablens/engine";

const BASE = import.meta.env.VITE_API_BASE ?? "";

let healthP: Promise<{ ai: boolean; provider?: string | null }> | null = null;

/** Is the AI proxy reachable and configured? Static deployments simply answer "no". */
export function aiHealth(): Promise<{ ai: boolean; provider?: string | null }> {
  if (!healthP)
    healthP = (async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3000);
        const r = await fetch(`${BASE}/api/health`, { signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return { ai: false };
        const j = (await r.json()) as { ai?: boolean; provider?: string | null };
        return { ai: !!j.ai, provider: j.provider ?? null };
      } catch {
        return { ai: false };
      }
    })();
  return healthP;
}

export interface ParseResult {
  ok: true;
  mode: "template" | "scene";
  scene: Scene;
  template?: string;
  args?: Record<string, number>;
  confidence: number;
  assumptions: string[];
  uncertain: string[];
  attempts: number;
  repaired: boolean;
}

export interface ImagePayload {
  mediaType: "image/jpeg";
  data: string;
  preview: string;
}

async function post<T>(path: string, body: unknown, timeoutMs = 90_000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const j = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as T & { ok: boolean; error?: string };
    if (!j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("The AI took too long to answer.", { cause: e });
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function parseWithAI(text: string, image?: ImagePayload) {
  return post<ParseResult | { ok: true; mode: "unsupported"; reason: string }>("/api/parse", {
    text,
    image: image ? { mediaType: image.mediaType, data: image.data } : undefined,
  });
}

export interface TutorReply {
  ok: true;
  reply: string;
  actions: { type: "setParam"; param: string; value: number; label?: string }[];
  prediction?: { question: string; choices: string[] };
}

export function askTutor(body: {
  scene: Scene;
  state: { verification: unknown; moment: string; events: string[] };
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
}) {
  return post<TutorReply>("/api/tutor", body, 60_000);
}

/** Downscale a photo on-device (max 1600 px, JPEG) before upload: faster, cheaper, and strips EXIF. */
export async function prepareImage(file: File | Blob): Promise<ImagePayload> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return { mediaType: "image/jpeg", data: url.split(",")[1], preview: url };
}
