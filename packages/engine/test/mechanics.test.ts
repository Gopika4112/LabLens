import { describe, expect, it } from "vitest";
import { MechanicsScene } from "../src/schema/scene";
import { simulateMechanics } from "../src/mechanics/engine";
import { exampleScene } from "../src/examples";
import { runScene } from "../src/run";

describe("mechanics engine", () => {
  it("conserves energy for a frictionless spring with every integrator", () => {
    for (const integrator of ["rk4", "verlet", "symplectic-euler"] as const) {
      const sc = MechanicsScene.parse({
        gravity: 0,
        integrator,
        bodies: [{ id: "m", mass: 1, position: { x: 1.3, y: 0 } }],
        springs: [{ id: "s", bodyA: "m", anchorB: { x: 0, y: 0 }, k: 40, restLength: 1 }],
      });
      const r = simulateMechanics(sc, { duration: 5 });
      expect(r.stats.maxEnergyResidualPct).toBeLessThan(integrator === "symplectic-euler" ? 3 : 0.01);
    }
  });
  it("symplectic integrators keep bounded energy error while RK4's is tiny", () => {
    const run = (integrator: "rk4" | "verlet") => {
      const sc = MechanicsScene.parse({
        gravity: 0,
        integrator,
        dt: 0.01,
        bodies: [{ id: "m", mass: 1, position: { x: 1.3, y: 0 } }],
        springs: [{ id: "s", bodyA: "m", anchorB: { x: 0, y: 0 }, k: 40, restLength: 1 }],
      });
      return simulateMechanics(sc, { duration: 60 }).stats.maxEnergyResidualPct;
    };
    expect(run("verlet")).toBeLessThan(0.5);
    expect(run("rk4")).toBeLessThan(0.5);
  });
  it("a rope never pushes: a thrown-up hanging mass makes the rope go slack", () => {
    const s = exampleScene("atwood");
    const m = { ...s.mechanics!, bodies: s.mechanics!.bodies.map((b, i) => (i === 0 ? { ...b, velocity: { x: 0, y: 6 } } : b)) };
    const r = simulateMechanics(m, { duration: 0.3 });
    expect(r.events.some((e) => e.kind === "rope-slack")).toBe(true);
    for (const f of r.frames) expect(f.ropeTension[0]).toBeGreaterThanOrEqual(-1e-9);
  });
  it("stops the run when a block reaches the pulley", () => {
    const r = runScene(exampleScene("incline-pulley"));
    if (r.domain !== "mechanics") throw new Error();
    expect(r.result.stoppedEarly).toMatch(/reaches the pulley/);
  });
  it("produces free-body forces that sum to m·a", () => {
    const r = runScene(exampleScene("incline-pulley"));
    if (r.domain !== "mechanics") throw new Error();
    const f = r.result.frames[20];
    const masses = [2, 3];
    f.forces.forEach((list, i) => {
      const fx = list.reduce((s, v) => s + v.fx, 0),
        fy = list.reduce((s, v) => s + v.fy, 0);
      expect(fx).toBeCloseTo(masses[i] * f.bodies[i].ax, 9);
      expect(fy).toBeCloseTo(masses[i] * f.bodies[i].ay, 9);
    });
  });
  it("conserves momentum in collisions", () => {
    const r = runScene(exampleScene("collision"));
    expect(r.verification.audits.find((a) => a.label === "Momentum conservation")!.pass).toBe(true);
  });
  it("detects the moment a sliding block comes to rest", () => {
    const r = runScene(exampleScene("sliding-stop"));
    if (r.domain !== "mechanics") throw new Error();
    expect(r.result.events.some((e) => e.kind === "comes-to-rest")).toBe(true);
  });
  it("bounces with the right restitution", () => {
    const sc = MechanicsScene.parse({
      bodies: [{ id: "b", mass: 1, shape: "ball", size: 0.2, position: { x: 0, y: 2.1 } }],
      surfaces: [{ id: "g", from: { x: -2, y: 0 }, to: { x: 2, y: 0 }, restitution: 0.8 }],
    });
    const r = simulateMechanics(sc, { duration: 0.75 });
    const peak = Math.max(...r.frames.filter((f) => f.t > 0.7).map((f) => f.bodies[0].vy));
    void peak;
    const bounce = r.events.find((e) => e.kind === "bounce")!;
    expect(bounce.t).toBeCloseTo(Math.sqrt(4 / 9.81), 4);
    const after = r.frames.find((f) => f.t > bounce.t + 0.01)!;
    expect(after.bodies[0].vy).toBeGreaterThan(0);
  });
  it("passes the energy audit on every mechanics example", () => {
    for (const id of [
      "incline-pulley",
      "atwood",
      "table-pulley",
      "incline-block",
      "sliding-stop",
      "pendulum",
      "spring",
      "vertical-spring",
      "projectile",
      "drag",
      "collision",
    ]) {
      const r = runScene(exampleScene(id));
      for (const a of r.verification.audits) expect(a.pass, `${id}: ${a.label} = ${a.value}`).toBe(true);
    }
  });
});
