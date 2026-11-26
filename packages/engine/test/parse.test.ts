import { describe, expect, it } from "vitest";
import { parseOffline, quantities } from "../src/parse/offline";

describe("offline problem parser", () => {
  it("reads units and prefixes", () => {
    const q = quantities("a 4.7 kΩ resistor, 220 µF, 3 cm, 500 g and 12 V");
    expect(q.map((x) => [x.unit, +x.value.toPrecision(6)])).toEqual([
      ["ohm", 4700],
      ["F", 0.00022],
      ["m", 0.03],
      ["kg", 0.5],
      ["V", 12],
    ]);
  });
  const cases: [string, string, Record<string, number>][] = [
    ["a 2 kg block on a 30° incline with friction 0.2 attached over a pulley to a 3 kg hanging mass", "inclinePulley", { m1: 2, m2: 3, angle: 30, muK: 0.2 }],
    ["A 5 kg mass hangs from a pulley; it is connected to a 4 kg block on a frictionless table.", "inclinePulley", { m1: 4, m2: 5, angle: 0, muK: 0 }],
    ["Two masses of 3 kg and 5 kg hang over a pulley (Atwood machine).", "atwood", { m1: 3, m2: 5 }],
    ["A pendulum of length 0.8 m is released from 15°.", "pendulum", { L: 0.8, angle: 15 }],
    ["A 0.5 kg mass on a spring with k = 200 N/m is pulled 0.1 m and released.", "springMass", { m: 0.5, k: 200, amplitude: 0.1 }],
    ["A ball is thrown at 20 m/s at 35° from a 10 m cliff.", "projectile", { v0: 20, angle: 35, h0: 10 }],
    ["A 1 kΩ resistor and a 100 µF capacitor are connected to a 9 V battery. Find the time constant.", "rcCharge", { R: 1000, C: 0.0001, V: 9 }],
    ["Find the resonant frequency of a series circuit with R = 20 Ω, L = 50 mH and C = 2 µF.", "rlc", { R: 20, L: 0.05, C: 0.000002 }],
    ["Three resistors of 10 Ω, 20 Ω and 30 Ω are in parallel across 6 V.", "parallel", { R1: 10, R2: 20, R3: 30, V: 6 }],
    ["An object is 30 cm from a converging lens with a focal length of 10 cm.", "thinLens", { f: 0.1, do: 0.3 }],
    ["Light passes from air into water at an angle of incidence of 50°.", "snell", { n: 1.33, angle: 50 }],
    ["What is the critical angle for glass with n = 1.52?", "tir", { n: 1.52 }],
    ["A concave mirror has a radius of curvature of 40 cm.", "concaveMirror", { R: 0.4 }],
    ["A 3 kg box slides down a 25° ramp with μk = 0.15 and μs = 0.3.", "inclineBlock", { m: 3, angle: 25, muK: 0.15, muS: 0.3 }],
  ];
  for (const [text, template, args] of cases) {
    it(`"${text.slice(0, 50)}…" → ${template}`, () => {
      const r = parseOffline(text)!;
      expect(r).not.toBeNull();
      expect(r.template).toBe(template);
      for (const [k, v] of Object.entries(args)) expect(r.args[k], k).toBeCloseTo(v, 9);
    });
  }
  it("returns null for non-physics text", () => {
    expect(parseOffline("What is the capital of France?")).toBeNull();
  });
  it("lists the assumptions it had to make", () => {
    const r = parseOffline("A block slides down a 30° ramp.")!;
    expect(r.assumed.length).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThan(1);
  });
});
