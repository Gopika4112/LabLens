import { describe, expect, it } from "vitest";
import { CircuitScene } from "../src/schema/scene";
import { Circuit, simulateCircuit, acSweep } from "../src/circuits/mna";
import { exampleScene } from "../src/examples";
import { runScene } from "../src/run";

const rc = () =>
  CircuitScene.parse({
    ground: "g",
    nodes: [{ id: "g" }, { id: "a" }, { id: "b" }],
    components: [
      { id: "V", type: "voltageSource", a: "a", b: "g", voltage: 10 },
      { id: "R", type: "resistor", a: "a", b: "b", resistance: 100 },
      { id: "C", type: "capacitor", a: "b", b: "g", capacitance: 0.01 },
    ],
  });

describe("MNA circuit engine", () => {
  it("DC operating point of a divider", () => {
    const c = new Circuit(
      CircuitScene.parse({
        ground: "g",
        nodes: [{ id: "g" }, { id: "a" }, { id: "b" }],
        components: [
          { id: "V", type: "voltageSource", a: "a", b: "g", voltage: 12 },
          { id: "R1", type: "resistor", a: "a", b: "b", resistance: 1000 },
          { id: "R2", type: "resistor", a: "b", b: "g", resistance: 3000 },
        ],
      }),
    );
    const op = c.dc();
    expect(op.nodeV[2]).toBeCloseTo(9, 12);
    expect(op.compI[0]).toBeCloseTo(-0.003, 12); // source delivers: current flows b→a through it
  });
  it("tracks the whole RC charging curve, not just τ", () => {
    const r = simulateCircuit(rc(), 5);
    for (const f of r.frames.filter((_, i) => i % 50 === 0)) expect(f.compV[2]).toBeCloseTo(10 * (1 - Math.exp(-f.t)), 4);
  });
  it("trapezoidal is more accurate than backward Euler at the same step", () => {
    const err = (method: "trapezoidal" | "backward-euler") => {
      const r = simulateCircuit(rc(), 3, { method, dt: 0.02 });
      return Math.max(...r.frames.map((f) => Math.abs(f.compV[2] - 10 * (1 - Math.exp(-f.t)))));
    };
    expect(err("trapezoidal")).toBeLessThan(err("backward-euler") / 20);
  });
  it("satisfies KCL and Tellegen at every instant of every circuit example", () => {
    for (const id of ["rc-charge", "rc-discharge", "rl", "rlc", "divider", "parallel", "bridge"]) {
      const r = runScene(exampleScene(id));
      for (const a of r.verification.audits) expect(a.pass, `${id}: ${a.label}`).toBe(true);
    }
  });
  it("switch closes exactly at its time and the current jumps", () => {
    const r = runScene(exampleScene("rc-charge"));
    if (r.domain !== "circuits") throw new Error();
    const closeAt = 0.5;
    expect(r.result.events[0].t).toBeCloseTo(closeAt, 12);
    const before = r.result.frames.filter((f) => f.t < closeAt);
    expect(Math.max(...before.map((f) => Math.abs(f.compI[2])))).toBeLessThan(1e-12);
  });
  it("AC sweep peaks at resonance with unity gain across R", () => {
    const sw = acSweep(exampleScene("rlc").circuit!)!;
    const k = sw.mag.indexOf(Math.max(...sw.mag));
    expect(sw.f[k]).toBeGreaterThan(140);
    expect(sw.f[k]).toBeLessThan(180);
    // at the exact resonance L and C cancel: the full source voltage appears across R
    const f0 = 1 / (2 * Math.PI * Math.sqrt(0.1 * 1e-5));
    expect(new Circuit(exampleScene("rlc").circuit!).acProbe(f0, "V1", "R1").mag).toBeCloseTo(1, 10);
  });
});
