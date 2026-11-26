/**
 * POST /api/parse  { text?: string, image?: { mediaType, data(base64) } }
 * → { ok, scene, mode, confidence, assumptions, uncertain, attempts, repaired }
 *
 * Pipeline: vision LLM (free Gemini tier by default) → JSON → Zod structural validation → semantic validation
 *           → on failure, feed the exact issues back to the model (repair loop, ≤ 2 rounds).
 */
import { z } from "zod";
import { buildTemplate, TEMPLATES, validateScene, type ValidationIssue } from "../packages/engine/src/index";
import { json, rateLimited, extractJson } from "./_lib/http";
import { aiConfigured, ask, errorMessage, provider, type Msg, type Part } from "./_lib/llm";
import { parseSystem } from "./_lib/prompts";

const Body = z.object({
  text: z.string().max(4000).optional(),
  image: z
    .object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      data: z.string().max(7_000_000),
    })
    .optional(),
});

const Reply = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("template"),
    template: z.string(),
    args: z.record(z.string(), z.number()),
    title: z.string().optional(),
    problemText: z.string().optional(),
    question: z.string().optional(),
    confidence: z.number().min(0).max(1).default(0.5),
    assumptions: z.array(z.string()).default([]),
    uncertain: z.array(z.string()).default([]),
  }),
  z.object({
    mode: z.literal("scene"),
    scene: z.unknown(),
    problemText: z.string().optional(),
    question: z.string().optional(),
    confidence: z.number().min(0).max(1).default(0.5),
    assumptions: z.array(z.string()).default([]),
    uncertain: z.array(z.string()).default([]),
  }),
  z.object({ mode: z.literal("unsupported"), reason: z.string() }),
]);

type Check = { ok: true; value: Record<string, unknown> } | { ok: false; issues: ValidationIssue[] };

function check(raw: unknown): Check {
  const r = Reply.safeParse(raw);
  if (!r.success) return { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  const reply = r.data;
  if (reply.mode === "unsupported") return { ok: true, value: reply };
  let candidate: unknown;
  if (reply.mode === "template") {
    const t = TEMPLATES[reply.template];
    if (!t) return { ok: false, issues: [{ path: "template", message: `unknown template "${reply.template}". Valid: ${Object.keys(TEMPLATES).join(", ")}` }] };
    const unknownArgs = Object.keys(reply.args).filter((k) => !(k in t.defaults));
    if (unknownArgs.length)
      return {
        ok: false,
        issues: [{ path: "args", message: `unknown args ${unknownArgs.join(", ")} for ${t.name}; valid: ${Object.keys(t.defaults).join(", ")}` }],
      };
    try {
      candidate = { ...buildTemplate(reply.template, reply.args), id: "parsed", ...(reply.title ? { title: reply.title.slice(0, 100) } : {}) };
    } catch (e) {
      return { ok: false, issues: [{ path: "args", message: (e as Error).message }] };
    }
  } else candidate = reply.scene;
  const withText = { ...(candidate as object), problemText: reply.problemText?.slice(0, 2000), question: reply.question?.slice(0, 300) };
  const v = validateScene(withText);
  if (!v.ok) return { ok: false, issues: v.issues };
  return { ok: true, value: { ...reply, scene: v.scene, warnings: v.warnings } };
}

export async function POST(req: Request): Promise<Response> {
  if (!aiConfigured()) return json({ ok: false, error: "AI parsing is not configured on this server. Use the offline parser or an example." }, 503);
  if (rateLimited(req, 12)) return json({ ok: false, error: "Too many requests — wait a minute." }, 429);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }
  if (!body.text?.trim() && !body.image) return json({ ok: false, error: "Send some text or an image." }, 400);

  const content: Part[] = [];
  if (body.image) content.push({ type: "image", mediaType: body.image.mediaType, data: body.image.data });
  content.push({ type: "text", text: body.text?.trim() ? `Problem:\n${body.text.trim()}` : "Convert the physics problem in this image." });
  const messages: Msg[] = [{ role: "user", content }];
  const system = parseSystem(provider()?.compactPrompt ?? false);

  try {
    let lastIssues: ValidationIssue[] = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { text, model, provider: providerLabel } = await ask({ system, messages, effort: "medium" });
      let raw: unknown;
      let result: Check;
      try {
        raw = extractJson(text);
        result = check(raw);
      } catch (e) {
        result = { ok: false, issues: [{ path: "", message: `reply was not valid JSON (${(e as Error).message})` }] };
      }
      if (result.ok) {
        const v = result.value as { mode: string; confidence?: number };
        // each repair round costs confidence: the first reading was not right
        const confidence = Math.max(0.05, (v.confidence ?? 0.5) * (attempt === 1 ? 1 : 0.85 ** (attempt - 1)));
        return json({ ok: true, ...result.value, confidence, attempts: attempt, repaired: attempt > 1, model, provider: providerLabel });
      }
      lastIssues = result.issues;
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content: `That JSON failed LabLens validation:\n${result.issues.map((i) => `- ${i.path || "(root)"}: ${i.message}`).join("\n")}\nReturn the corrected JSON object only.`,
      });
    }
    return json({ ok: false, error: "Could not build a valid scene from this problem.", issues: lastIssues }, 422);
  } catch (e) {
    const { message, status } = errorMessage(e);
    return json({ ok: false, error: message }, status);
  }
}
