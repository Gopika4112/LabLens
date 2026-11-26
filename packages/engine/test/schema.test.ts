import { describe, expect, it } from "vitest";
import { validateScene, getPath, setPath } from "../src/schema/validate";
import { applyParam, paramValue } from "../src/params";
import { exampleScene, EXAMPLES } from "../src/examples";
import { buildTemplate, TEMPLATES } from "../src/templates";

describe("Scene Graph validation", () => {
  it("accepts every example", () => {
    for (const e of EXAMPLES) expect(() => exampleScene(e.id)).not.toThrow();
  });
  it("accepts every template at its defaults", () => {
    for (const name of Object.keys(TEMPLATES)) expect(validateScene({ ...buildTemplate(name), id: "t" }).ok).toBe(true);
  });
  it("rejects structural errors with readable paths", () => {
    const r = validateScene({
      version: "1",
      id: "x",
      title: "x",
      domain: "mechanics",
      mechanics: { bodies: [{ id: "a", mass: -1, position: { x: 0, y: 0 } }] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.path.includes("mass"))).toBe(true);
  });
  it("rejects dangling references (semantic check)", () => {
    const r = validateScene({
      version: "1",
      id: "x",
      title: "x",
      domain: "mechanics",
      mechanics: { bodies: [{ id: "a", mass: 1, position: { x: 0, y: 0 } }], ropes: [{ id: "r", bodyA: "a", bodyB: "ghost", via: [] }] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.message).join()).toContain('unknown body "ghost"');
  });
  it("rejects a circuit whose ground is not a node", () => {
    const r = validateScene({
      version: "1",
      id: "c",
      title: "c",
      domain: "circuits",
      circuit: { ground: "gnd", nodes: [{ id: "a" }, { id: "b" }], components: [{ id: "R", type: "resistor", a: "a", b: "b", resistance: 1 }] },
    });
    expect(r.ok).toBe(false);
  });
  it("requires the domain payload", () => {
    expect(validateScene({ version: "1", id: "x", title: "x", domain: "optics" }).ok).toBe(false);
  });
});

describe("parameters", () => {
  it("get/set paths immutably", () => {
    const o = { a: { b: [1, { c: 2 }] } };
    const n = setPath(o, "a.b.1.c", 5);
    expect(getPath(n, "a.b.1.c")).toBe(5);
    expect(getPath(o, "a.b.1.c")).toBe(2);
  });
  it("template params rebuild geometry consistently", () => {
    const s = exampleScene("incline-pulley");
    const s2 = applyParam(s, "angle", 45);
    const ramp = s2.mechanics!.surfaces[0];
    expect((Math.atan2(ramp.to.y - ramp.from.y, ramp.to.x - ramp.from.x) * 180) / Math.PI).toBeCloseTo(45, 9);
    expect(paramValue(s2, "angle")).toBe(45);
    expect(s2.problemText).toBe(s.problemText);
  });
  it("clamps to the slider range", () => {
    const s = applyParam(exampleScene("atwood"), "m2", 1e6);
    expect(paramValue(s, "m2")).toBe(10);
  });
});
