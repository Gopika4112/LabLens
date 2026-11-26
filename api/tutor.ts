/**
 * POST /api/tutor — Socratic tutor that sees the live simulation state.
 * The client sends the scene, its verified results, the current instant and the chat;
 * actions in the reply are validated against the scene's real parameters before returning.
 */
import { z } from "zod";
import { describeScene, validateScene, paramValue } from "../packages/engine/src/index";
import { json, rateLimited, extractJson, plainText } from "./_lib/http";
import { aiConfigured, ask, errorMessage, type Msg } from "./_lib/llm";
import { TUTOR_SYSTEM } from "./_lib/prompts";

const Body = z.object({
  scene: z.unknown(),
  state: z.object({
    verification: z.unknown(),
    moment: z.string().max(2000),
    events: z.array(z.string().max(300)).max(30).default([]),
  }),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(3000) }))
    .max(24)
    .default([]),
  message: z.string().min(1).max(2000),
});

const Action = z.object({ type: z.literal("setParam"), param: z.string(), value: z.number(), label: z.string().max(80).optional() });
const Reply = z.object({
  reply: z.string().min(1).max(2000),
  actions: z.array(z.unknown()).default([]),
  prediction: z.object({ question: z.string().max(300), choices: z.array(z.string().max(120)).min(2).max(6) }).optional(),
});

export async function POST(req: Request): Promise<Response> {
  if (!aiConfigured()) return json({ ok: false, error: "The AI tutor is offline here — the built-in experiments still work." }, 503);
  if (rateLimited(req, 30)) return json({ ok: false, error: "Too many messages — wait a minute." }, 429);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }
  const v = validateScene(body.scene);
  if (!v.ok) return json({ ok: false, error: "Invalid scene." }, 400);
  const scene = v.scene;
  const params = scene.params.map((p) => ({ id: p.id, label: p.label, value: paramValue(scene, p.id), min: p.min, max: p.max, unit: p.unit }));
  const stateText = [
    `SCENE: ${describeScene(scene)}`,
    scene.problemText ? `ORIGINAL PROBLEM: ${scene.problemText}` : "",
    `PARAMETERS (id, label, current value, range): ${JSON.stringify(params)}`,
    `VERIFIED RESULTS (simulated vs analytic): ${JSON.stringify(body.state.verification).slice(0, 4000)}`,
    `CURRENT INSTANT: ${body.state.moment}`,
    body.state.events.length ? `EVENTS SO FAR: ${body.state.events.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const messages: Msg[] = [
    ...body.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `<lab_state>\n${stateText}\n</lab_state>\n\nStudent: ${body.message}` },
  ];
  try {
    const { text } = await ask({ system: TUTOR_SYSTEM, messages, effort: "low", maxTokens: 4000 });
    let parsed: z.infer<typeof Reply>;
    try {
      parsed = Reply.parse(extractJson(text));
    } catch {
      // never show raw JSON: salvage the "reply" string if the object itself was malformed
      const m = /"reply"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text);
      let reply = text;
      if (m) {
        try {
          reply = JSON.parse(`"${m[1]}"`) as string;
        } catch {
          reply = m[1];
        }
      }
      parsed = { reply: reply.slice(0, 1200), actions: [] };
    }
    // keep only actions that target real params, clamped to their ranges
    const actions = parsed.actions
      .map((a) => Action.safeParse(a))
      .filter((r) => r.success)
      .map((r) => r.data!)
      .filter((a) => scene.params.some((p) => p.id === a.param))
      .map((a) => {
        const p = scene.params.find((q) => q.id === a.param)!;
        return { ...a, value: Math.min(p.max, Math.max(p.min, a.value)) };
      })
      .slice(0, 3);
    return json({ ok: true, reply: plainText(parsed.reply), actions, prediction: parsed.prediction });
  } catch (e) {
    const { message, status } = errorMessage(e);
    return json({ ok: false, error: message }, status);
  }
}
