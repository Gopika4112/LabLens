import { describe, expect, it } from "vitest";
import { OpticsScene } from "../src/schema/scene";
import { traceOptics, leastSquaresMeet } from "../src/optics/tracer";
import { exampleScene } from "../src/examples";
import { applyParam } from "../src/params";

describe("ray tracer", () => {
  it("plane mirror: angle of incidence = angle of reflection", () => {
    const o = OpticsScene.parse({
      elements: [{ id: "m", type: "planeMirror", from: { x: 0, y: -1 }, to: { x: 0, y: 1 } }],
      sources: [{ id: "r", type: "ray", origin: { x: -1, y: -1 }, angle: 45 }],
    });
    const ray = traceOptics(o).rays[0];
    const [a, b, c] = ray.points;
    expect(b.x).toBeCloseTo(0, 12);
    expect(c.x - b.x).toBeCloseTo(-(b.x - a.x) * ((c.y - b.y) / (b.y - a.y)), 9);
  });
  it("total internal reflection happens only above the critical angle", () => {
    const tirAt = (angle: number) => traceOptics(applyParam(exampleScene("tir"), "angle", angle).optics!).events.some((e) => e.kind === "tir");
    expect(tirAt(40)).toBe(false);
    expect(tirAt(43)).toBe(true);
  });
  it("transmitted intensity drops at each interface (Fresnel)", () => {
    const r = traceOptics(exampleScene("snell").optics!);
    const I = r.rays[0].intensity;
    expect(I[1]).toBeLessThan(I[0]);
    expect(I[1]).toBeGreaterThan(0.9);
  });
  it("an ideal thin lens images every ray from a point to one point", () => {
    const r = traceOptics(exampleScene("lens").optics!);
    const lines = r.rays.map((ray) => ({ p: ray.points[1], d: { x: ray.points[2].x - ray.points[1].x, y: ray.points[2].y - ray.points[1].y } }));
    const meet = leastSquaresMeet(lines)!;
    for (const l of lines) {
      const cross = Math.abs(l.d.x * (meet.y - l.p.y) - l.d.y * (meet.x - l.p.x)) / Math.hypot(l.d.x, l.d.y);
      expect(cross).toBeLessThan(1e-9);
    }
  });
  it("Snell residual is at machine precision on every optics example", () => {
    for (const id of ["snell", "tir", "lens", "magnifier", "mirror", "thick-lens", "prism"])
      expect(traceOptics(exampleScene(id).optics!).stats.maxSnellResidual).toBeLessThan(1e-12);
  });
});
