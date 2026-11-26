/** Tests the AI proxy's validation + repair loop and action filtering, with the LLM mocked out. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const replies: string[] = [];
const seen: unknown[] = [];
vi.mock("./_lib/llm", async (orig) => {
  const real = await orig<typeof import("./_lib/llm")>();
  return {
    ...real,
    aiConfigured: () => true,
    provider: () => ({ id: "gemini", label: "Mock", baseUrl: "", model: "mock", compactPrompt: false }),
    ask: vi.fn(async (opts: { messages: unknown[] }) => {
      seen.push(JSON.parse(JSON.stringify(opts.messages)));
      return { text: replies.shift() ?? "{}", model: "mock", provider: "Mock" };
    }),
  };
});
vi.mock("./_lib/http", async (orig) => ({ ...(await orig<typeof import("./_lib/http")>()), rateLimited: () => false }));

const { POST: parse } = await import("./parse");
const { POST: tutor } = await import("./tutor");
const { exampleScene } = await import("../packages/engine/src/index");

const req = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  replies.length = 0;
  seen.length = 0;
});

describe("/api/parse", () => {
  it("accepts a valid template reply on the first try", async () => {
    replies.push(JSON.stringify({ mode: "template", template: "atwood", args: { m1: 2, m2: 5 }, confidence: 0.9, assumptions: [], uncertain: [] }));
    const r = await (await parse(req({ text: "atwood 2 kg 5 kg" }))).json();
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.scene.mechanics.bodies[1].mass).toBe(5);
  });
  it("repairs an invalid first draft by feeding back the exact issues", async () => {
    replies.push("```json\n" + JSON.stringify({ mode: "template", template: "atwod", args: { m1: 2 } }) + "\n```");
    replies.push(JSON.stringify({ mode: "template", template: "atwood", args: { m1: 2, m2: 3 }, confidence: 0.8 }));
    const r = await (await parse(req({ text: "x" }))).json();
    expect(r.ok).toBe(true);
    expect(r.repaired).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.confidence).toBeCloseTo(0.8 * 0.85, 9);
    const repairMsg = JSON.stringify(seen[1]);
    expect(repairMsg).toContain('unknown template \\"atwod\\"');
  });
  it("rejects a free-form scene with dangling references, then gives up after 3 attempts", async () => {
    const bad = {
      mode: "scene",
      scene: {
        version: "1",
        id: "s",
        title: "t",
        domain: "mechanics",
        mechanics: { bodies: [{ id: "a", mass: 1, position: { x: 0, y: 0 } }], ropes: [{ id: "r", bodyA: "a", bodyB: "ghost" }] },
      },
    };
    replies.push(JSON.stringify(bad), JSON.stringify(bad), JSON.stringify(bad));
    const res = await parse(req({ text: "x" }));
    expect(res.status).toBe(422);
    const r = await res.json();
    expect(r.issues.map((i: { message: string }) => i.message).join()).toContain("ghost");
  });
  it("passes through 'unsupported'", async () => {
    replies.push(JSON.stringify({ mode: "unsupported", reason: "That's a chemistry question." }));
    const r = await (await parse(req({ text: "balance H2 + O2" }))).json();
    expect(r.mode).toBe("unsupported");
  });
  it("validates the request body", async () => {
    expect((await parse(req({}))).status).toBe(400);
  });
});

describe("/api/tutor", () => {
  it("drops actions on unknown params and clamps values to slider ranges", async () => {
    replies.push(
      JSON.stringify({
        reply: "Predict first! What happens if m₂ doubles?",
        actions: [
          { type: "setParam", param: "m2", value: 999 },
          { type: "setParam", param: "notAParam", value: 1 },
        ],
      }),
    );
    const r = await (
      await tutor(req({ scene: exampleScene("atwood"), state: { verification: {}, moment: "t=0", events: [] }, history: [], message: "what if I double m2?" }))
    ).json();
    expect(r.ok).toBe(true);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].value).toBe(10);
    // the live lab state is sent to the model
    expect(JSON.stringify(seen[0])).toContain("<lab_state>");
  });
});
