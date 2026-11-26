/**
 * Parametric scene templates. Each one turns a handful of textbook numbers into a complete,
 * geometrically consistent Scene Graph. They are used by:
 *   - the example gallery,
 *   - the offline rule-based parser (text → template + args),
 *   - the AI parser (Claude may answer with a template call instead of a raw scene),
 *   - sliders whose param path is "template.args.<name>" (geometry is rebuilt on change).
 */
import type { SceneInput } from "../schema/scene";
import { deg2rad } from "../math/numeric";

type Args = Record<string, number>;

export interface TemplateDef {
  name: string;
  domain: "mechanics" | "circuits" | "optics";
  title: string;
  /** One-line description for the AI prompt and the gallery. */
  description: string;
  defaults: Args;
  /** Documentation of each arg: [label, unit]. */
  argDocs: Record<string, [string, string]>;
  build: (a: Args) => SceneInput;
}

const P = (id: string, label: string, min: number, max: number, step: number, unit = "") => ({
  id,
  label,
  path: `template.args.${id}`,
  min,
  max,
  step,
  unit,
});

const sizeFor = (m: number) => Math.min(0.6, Math.max(0.28, 0.3 * Math.cbrt(m)));
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

function base(name: string, title: string, domain: TemplateDef["domain"], a: Args, extra: Partial<SceneInput>): SceneInput {
  return { version: "1", id: name, title, domain, template: { name, args: a }, ...extra } as SceneInput;
}

/* ───────────────────────────── mechanics ───────────────────────────── */

const inclinePulley: TemplateDef = {
  name: "inclinePulley",
  domain: "mechanics",
  title: "Block on an incline, pulley, hanging mass",
  description: "Block m1 on a surface inclined at `angle` degrees (0 = flat table) with friction, rope over a pulley at the top to a hanging mass m2.",
  defaults: { m1: 2, m2: 3, angle: 30, muS: 0.25, muK: 0.2 },
  argDocs: {
    m1: ["mass on the surface", "kg"],
    m2: ["hanging mass", "kg"],
    angle: ["incline angle", "°"],
    muS: ["static friction coefficient", ""],
    muK: ["kinetic friction coefficient", ""],
  },
  build: (a) => {
    const th = deg2rad(a.angle);
    const L = 3;
    const t = { x: Math.cos(th), y: Math.sin(th) };
    const n = { x: -t.y, y: t.x };
    const h1 = sizeFor(a.m1) / 2,
      h2 = sizeFor(a.m2) / 2;
    const top = { x: L * t.x, y: L * t.y };
    const r = Math.max(0.22, h2 + 0.04);
    const guide = { x: top.x + n.x * h1, y: top.y + n.y * h1 };
    const center = { x: r6(guide.x), y: r6(guide.y - r) };
    const flat = a.angle < 0.5;
    return base("inclinePulley", flat ? "Block on a table with a pulley" : "Incline with a pulley", "mechanics", a, {
      duration: 3,
      question: "acceleration of the system and tension in the rope",
      mechanics: {
        bodies: [
          {
            id: "m1",
            label: "Block",
            mass: a.m1,
            size: sizeFor(a.m1),
            position: { x: r6(0.7 * t.x + n.x * h1), y: r6(0.7 * t.y + n.y * h1) },
            onSurface: "ramp",
          },
          { id: "m2", label: "Hanging mass", mass: a.m2, size: sizeFor(a.m2), position: { x: r6(center.x + r), y: r6(center.y - 0.75) }, collides: false },
        ],
        surfaces: [
          {
            id: "ramp",
            kind: flat ? "table" : "incline",
            from: { x: 0, y: 0 },
            to: { x: r6(top.x), y: r6(top.y) },
            muStatic: Math.max(a.muS, a.muK),
            muKinetic: a.muK,
          },
        ],
        pulleys: [{ id: "P", position: center, radius: r }],
        ropes: [
          {
            id: "rope",
            bodyA: "m1",
            bodyB: "m2",
            via: [
              { pulley: "P", side: "top" },
              { pulley: "P", side: "right" },
            ],
          },
        ],
      },
      params: [
        P("m1", "Block mass m₁", 0.5, 10, 0.1, "kg"),
        P("m2", "Hanging mass m₂", 0.5, 10, 0.1, "kg"),
        P("angle", "Incline angle θ", 0, 60, 1, "°"),
        P("muK", "Kinetic friction μk", 0, 0.8, 0.01),
        P("muS", "Static friction μs", 0, 1, 0.01),
      ],
    });
  },
};

const atwood: TemplateDef = {
  name: "atwood",
  domain: "mechanics",
  title: "Atwood machine",
  description: "Two masses m1 (left) and m2 (right) hanging on either side of one ideal pulley.",
  defaults: { m1: 2, m2: 3 },
  argDocs: { m1: ["left mass", "kg"], m2: ["right mass", "kg"] },
  build: (a) => {
    const r = 0.3;
    return base("atwood", "Atwood machine", "mechanics", a, {
      duration: 2.5,
      question: "acceleration of the masses and tension in the string",
      mechanics: {
        bodies: [
          { id: "m1", label: "Left mass", mass: a.m1, size: sizeFor(a.m1), position: { x: -r, y: 1.6 }, collides: false },
          { id: "m2", label: "Right mass", mass: a.m2, size: sizeFor(a.m2), position: { x: r, y: 1.6 }, collides: false },
        ],
        pulleys: [{ id: "P", position: { x: 0, y: 3.4 }, radius: r }],
        ropes: [
          {
            id: "rope",
            bodyA: "m1",
            bodyB: "m2",
            via: [
              { pulley: "P", side: "left" },
              { pulley: "P", side: "right" },
            ],
          },
        ],
      },
      params: [P("m1", "Left mass m₁", 0.2, 10, 0.1, "kg"), P("m2", "Right mass m₂", 0.2, 10, 0.1, "kg")],
    });
  },
};

const inclineBlock: TemplateDef = {
  name: "inclineBlock",
  domain: "mechanics",
  title: "Block sliding down an incline",
  description: "A block of mass m released from rest on an incline at `angle` degrees with static/kinetic friction.",
  defaults: { m: 2, angle: 30, muS: 0.3, muK: 0.2 },
  argDocs: { m: ["mass", "kg"], angle: ["incline angle", "°"], muS: ["static friction", ""], muK: ["kinetic friction", ""] },
  build: (a) => {
    const th = deg2rad(Math.max(1, a.angle));
    const L = 3.2;
    const H = L * Math.sin(th),
      W = L * Math.cos(th);
    return base("inclineBlock", "Block on an incline", "mechanics", a, {
      duration: 3,
      question: "acceleration of the block down the incline",
      mechanics: {
        bodies: [
          {
            id: "block",
            label: "Block",
            mass: a.m,
            size: sizeFor(a.m),
            position: { x: r6(0.4 * Math.cos(th)), y: r6(H - 0.4 * Math.sin(th) + 0.3) },
            onSurface: "ramp",
          },
        ],
        surfaces: [
          { id: "ramp", kind: "incline", from: { x: 0, y: r6(H) }, to: { x: r6(W), y: 0 }, muStatic: Math.max(a.muS, a.muK), muKinetic: a.muK },
          {
            id: "ground",
            kind: "floor",
            from: { x: r6(W), y: 0 },
            to: { x: r6(W + 6), y: 0 },
            muStatic: Math.max(a.muS, a.muK),
            muKinetic: a.muK,
            restitution: 0,
          },
        ],
      },
      params: [
        P("angle", "Incline angle θ", 5, 70, 1, "°"),
        P("muK", "Kinetic friction μk", 0, 1, 0.01),
        P("muS", "Static friction μs", 0, 1.2, 0.01),
        P("m", "Mass", 0.5, 10, 0.1, "kg"),
      ],
    });
  },
};

const slidingStop: TemplateDef = {
  name: "slidingStop",
  domain: "mechanics",
  title: "Sliding to a stop",
  description: "A block of mass m sliding at initial speed v0 on a flat floor with kinetic friction mu.",
  defaults: { m: 1, v0: 4, mu: 0.3 },
  argDocs: { m: ["mass", "kg"], v0: ["initial speed", "m/s"], mu: ["friction coefficient", ""] },
  build: (a) => {
    const tStop = a.mu > 0 ? a.v0 / (a.mu * 9.81) : 4;
    return base("slidingStop", "Sliding to a stop", "mechanics", a, {
      duration: Math.min(10, tStop + 0.6),
      question: "stopping distance",
      mechanics: {
        bodies: [{ id: "block", label: "Block", mass: a.m, size: sizeFor(a.m), position: { x: 0, y: 0.3 }, velocity: { x: a.v0, y: 0 }, onSurface: "floor" }],
        surfaces: [{ id: "floor", kind: "floor", from: { x: -1, y: 0 }, to: { x: 60, y: 0 }, muStatic: a.mu, muKinetic: a.mu }],
      },
      params: [P("v0", "Initial speed v₀", 0.5, 12, 0.1, "m/s"), P("mu", "Friction μk", 0.05, 1, 0.01), P("m", "Mass", 0.2, 10, 0.1, "kg")],
    });
  },
};

const pendulum: TemplateDef = {
  name: "pendulum",
  domain: "mechanics",
  title: "Simple pendulum",
  description: "A bob of mass m on a string of length L released from rest at `angle` degrees from vertical.",
  defaults: { L: 1.5, angle: 30, m: 1 },
  argDocs: { L: ["string length", "m"], angle: ["release angle", "°"], m: ["bob mass", "kg"] },
  build: (a) => {
    const th = deg2rad(a.angle);
    const T0 = 2 * Math.PI * Math.sqrt(a.L / 9.81);
    return base("pendulum", "Simple pendulum", "mechanics", a, {
      duration: Math.min(12, 3 * T0 * 1.15),
      question: "period of the pendulum",
      mechanics: {
        bodies: [
          {
            id: "bob",
            label: "Bob",
            mass: a.m,
            shape: "ball",
            size: 0.22,
            position: { x: r6(a.L * Math.sin(th)), y: r6(3 - a.L * Math.cos(th)) },
            collides: false,
          },
        ],
        links: [{ id: "string", kind: "string", body: "bob", pivot: { x: 0, y: 3 }, length: a.L }],
      },
      params: [P("L", "Length L", 0.3, 2.8, 0.05, "m"), P("angle", "Release angle θ₀", 2, 89, 1, "°"), P("m", "Bob mass", 0.1, 5, 0.1, "kg")],
    });
  },
};

const springMass: TemplateDef = {
  name: "springMass",
  domain: "mechanics",
  title: "Mass on a spring",
  description:
    "A mass m on a horizontal frictionless track attached to a spring of stiffness k, pulled out by `amplitude` and released. Optional damping (N·s/m).",
  defaults: { m: 1, k: 40, amplitude: 0.4, damping: 0 },
  argDocs: { m: ["mass", "kg"], k: ["spring constant", "N/m"], amplitude: ["initial stretch", "m"], damping: ["damping coefficient", "N·s/m"] },
  build: (a) => {
    const L0 = 1.6;
    const h = sizeFor(a.m) / 2;
    const T = 2 * Math.PI * Math.sqrt(a.m / a.k);
    return base("springMass", "Mass on a spring", "mechanics", a, {
      duration: Math.min(12, 3.2 * T),
      question: "period of oscillation",
      mechanics: {
        bodies: [{ id: "mass", label: "Mass", mass: a.m, size: sizeFor(a.m), position: { x: r6(L0 + a.amplitude), y: r6(h) }, onSurface: "track" }],
        surfaces: [{ id: "track", kind: "floor", from: { x: 0, y: 0 }, to: { x: 4, y: 0 } }],
        springs: [{ id: "spring", bodyA: "mass", anchorB: { x: 0, y: r6(h) }, k: a.k, restLength: L0, damping: a.damping }],
      },
      params: [
        P("k", "Spring constant k", 5, 200, 1, "N/m"),
        P("m", "Mass m", 0.2, 10, 0.1, "kg"),
        P("amplitude", "Amplitude", 0.05, 1, 0.01, "m"),
        P("damping", "Damping c", 0, 10, 0.1, "N·s/m"),
      ],
    });
  },
};

const verticalSpring: TemplateDef = {
  name: "verticalSpring",
  domain: "mechanics",
  title: "Hanging spring with damping",
  description: "A mass m hanging from a ceiling spring (stiffness k, damping c), released from the spring's natural length.",
  defaults: { m: 1, k: 30, damping: 0.8 },
  argDocs: { m: ["mass", "kg"], k: ["spring constant", "N/m"], damping: ["damping coefficient", "N·s/m"] },
  build: (a) => {
    const L0 = 1;
    const T = 2 * Math.PI * Math.sqrt(a.m / a.k);
    return base("verticalSpring", "Hanging spring with damping", "mechanics", a, {
      duration: Math.min(15, 8 * T),
      question: "equilibrium stretch and period",
      mechanics: {
        bodies: [{ id: "mass", label: "Mass", mass: a.m, size: sizeFor(a.m), position: { x: 0, y: 3.2 - L0 }, collides: false }],
        springs: [{ id: "spring", bodyA: "mass", anchorB: { x: 0, y: 3.2 }, k: a.k, restLength: L0, damping: a.damping }],
      },
      params: [P("k", "Spring constant k", 5, 150, 1, "N/m"), P("m", "Mass m", 0.2, 5, 0.1, "kg"), P("damping", "Damping c", 0, 8, 0.1, "N·s/m")],
    });
  },
};

const projectile: TemplateDef = {
  name: "projectile",
  domain: "mechanics",
  title: "Projectile motion",
  description: "A ball launched at speed v0 and `angle` degrees above horizontal from height h0 above flat ground, no air resistance.",
  defaults: { v0: 12, angle: 50, h0: 0 },
  argDocs: { v0: ["launch speed", "m/s"], angle: ["launch angle", "°"], h0: ["launch height", "m"] },
  build: (a) => {
    const th = deg2rad(a.angle);
    const vx = a.v0 * Math.cos(th),
      vy = a.v0 * Math.sin(th);
    const tf = (vy + Math.sqrt(vy * vy + 2 * 9.81 * a.h0)) / 9.81;
    return base("projectile", "Projectile motion", "mechanics", a, {
      duration: Math.min(12, tf + 0.8),
      question: "range, maximum height and time of flight",
      mechanics: {
        bodies: [{ id: "ball", label: "Ball", mass: 0.5, shape: "ball", size: 0.2, position: { x: 0, y: r6(a.h0 + 0.1) }, velocity: { x: r6(vx), y: r6(vy) } }],
        surfaces: [
          { id: "ground", kind: "floor", from: { x: -2, y: 0 }, to: { x: 80, y: 0 }, restitution: 0.45, muKinetic: 0.3, muStatic: 0.3 },
          ...(a.h0 > 0.05
            ? [
                { id: "cliff", kind: "table" as const, from: { x: -2, y: r6(a.h0) }, to: { x: 0, y: r6(a.h0) } },
                { id: "cliffFace", kind: "wall" as const, from: { x: 0, y: r6(a.h0) }, to: { x: 0, y: 0 } },
              ]
            : []),
        ],
      },
      params: [P("v0", "Launch speed v₀", 1, 25, 0.5, "m/s"), P("angle", "Launch angle", 5, 85, 1, "°"), P("h0", "Launch height", 0, 10, 0.5, "m")],
    });
  },
};

const dragFall: TemplateDef = {
  name: "dragFall",
  domain: "mechanics",
  title: "Falling with air resistance",
  description: "An object of mass m dropped from rest with quadratic air drag F = c·v².",
  defaults: { m: 0.5, c: 0.02 },
  argDocs: { m: ["mass", "kg"], c: ["drag coefficient", "kg/m"] },
  build: (a) => {
    const vt = Math.sqrt((a.m * 9.81) / a.c);
    return base("dragFall", "Falling with air resistance", "mechanics", a, {
      duration: Math.min(20, (6 * vt) / 9.81),
      question: "terminal speed",
      mechanics: {
        bodies: [{ id: "ball", label: "Ball", mass: a.m, shape: "ball", size: 0.25, position: { x: 0, y: 0 }, dragQuadratic: a.c }],
      },
      params: [P("m", "Mass m", 0.05, 5, 0.05, "kg"), P("c", "Drag coefficient c", 0.002, 0.2, 0.001, "kg/m")],
    });
  },
};

const collision: TemplateDef = {
  name: "collision",
  domain: "mechanics",
  title: "Elastic collision on a track",
  description: "Cart m1 moving at u1 hits cart m2 moving at u2 on a frictionless track (perfectly elastic).",
  defaults: { m1: 1, u1: 2, m2: 2, u2: 0 },
  argDocs: { m1: ["cart 1 mass", "kg"], u1: ["cart 1 velocity", "m/s"], m2: ["cart 2 mass", "kg"], u2: ["cart 2 velocity", "m/s"] },
  build: (a) =>
    base("collision", "Elastic collision", "mechanics", a, {
      duration: 2.5,
      question: "velocities after the collision",
      mechanics: {
        bodies: [
          { id: "cart1", label: "Cart 1", mass: a.m1, size: 0.4, position: { x: -1.4, y: 0.2 }, velocity: { x: a.u1, y: 0 }, onSurface: "track" },
          { id: "cart2", label: "Cart 2", mass: a.m2, size: 0.4, position: { x: 0.6, y: 0.2 }, velocity: { x: a.u2, y: 0 }, onSurface: "track" },
        ],
        surfaces: [{ id: "track", kind: "floor", from: { x: -6, y: 0 }, to: { x: 8, y: 0 } }],
      },
      params: [
        P("m1", "Mass m₁", 0.2, 6, 0.1, "kg"),
        P("u1", "Velocity u₁", -3, 4, 0.1, "m/s"),
        P("m2", "Mass m₂", 0.2, 6, 0.1, "kg"),
        P("u2", "Velocity u₂", -3, 3, 0.1, "m/s"),
      ],
    }),
};

/* ───────────────────────────── circuits ───────────────────────────── */

const rcCharge: TemplateDef = {
  name: "rcCharge",
  domain: "circuits",
  title: "Charging a capacitor (RC)",
  description: "Battery V, switch, resistor R and capacitor C (farads) in series; the switch closes and C charges from 0 V.",
  defaults: { V: 5, R: 1000, C: 0.001 },
  argDocs: { V: ["battery voltage", "V"], R: ["resistance", "Ω"], C: ["capacitance", "F"] },
  build: (a) => {
    const tau = a.R * a.C;
    return base("rcCharge", "Charging a capacitor", "circuits", a, {
      duration: r6(6.5 * tau),
      question: "time constant and capacitor voltage over time",
      circuit: {
        ground: "g",
        nodes: [
          { id: "g", position: { x: 0, y: 0 }, extra: [{ x: 4, y: 0 }] },
          { id: "n1", position: { x: 0, y: 2 } },
          { id: "n2", position: { x: 1.6, y: 2 } },
          { id: "n3", position: { x: 4, y: 2 } },
        ],
        components: [
          { id: "V1", label: "Battery", type: "voltageSource", a: "n1", b: "g", voltage: a.V },
          { id: "S1", label: "Switch", type: "switch", a: "n1", b: "n2", closeAt: r6(0.5 * tau) },
          { id: "R1", label: "Resistor", type: "resistor", a: "n2", b: "n3", resistance: a.R },
          { id: "C1", label: "Capacitor", type: "capacitor", a: "n3", b: "g", capacitance: a.C },
        ],
      },
      params: [P("R", "Resistance R", 10, 10000, 10, "Ω"), P("C", "Capacitance C", 0.0001, 0.005, 0.0001, "F"), P("V", "Battery V", 1, 24, 0.5, "V")],
    });
  },
};

const rcDischarge: TemplateDef = {
  name: "rcDischarge",
  domain: "circuits",
  title: "Discharging a capacitor (RC)",
  description: "A capacitor C charged to V0 discharges through resistor R when the switch closes.",
  defaults: { V0: 9, R: 2000, C: 0.0005 },
  argDocs: { V0: ["initial capacitor voltage", "V"], R: ["resistance", "Ω"], C: ["capacitance", "F"] },
  build: (a) => {
    const tau = a.R * a.C;
    return base("rcDischarge", "Discharging a capacitor", "circuits", a, {
      duration: r6(6.5 * tau),
      question: "time constant",
      circuit: {
        ground: "g",
        nodes: [
          { id: "g", position: { x: 0, y: 0 }, extra: [{ x: 4, y: 0 }] },
          { id: "n1", position: { x: 0, y: 2 } },
          { id: "n2", position: { x: 4, y: 2 } },
        ],
        components: [
          { id: "C1", label: "Capacitor", type: "capacitor", a: "n1", b: "g", capacitance: a.C, initialVoltage: a.V0 },
          { id: "S1", label: "Switch", type: "switch", a: "n1", b: "n2", closeAt: r6(0.5 * tau) },
          { id: "R1", label: "Resistor", type: "resistor", a: "n2", b: "g", resistance: a.R },
        ],
      },
      params: [P("R", "Resistance R", 10, 10000, 10, "Ω"), P("C", "Capacitance C", 0.0001, 0.005, 0.0001, "F"), P("V0", "Initial voltage", 1, 24, 0.5, "V")],
    });
  },
};

const rl: TemplateDef = {
  name: "rl",
  domain: "circuits",
  title: "Inductor current build-up (RL)",
  description: "Battery V, switch, resistor R and inductor L (henries) in series.",
  defaults: { V: 12, R: 100, L: 2 },
  argDocs: { V: ["battery voltage", "V"], R: ["resistance", "Ω"], L: ["inductance", "H"] },
  build: (a) => {
    const tau = a.L / a.R;
    return base("rl", "Inductor current build-up", "circuits", a, {
      duration: r6(10.5 * tau),
      question: "time constant and final current",
      circuit: {
        ground: "g",
        nodes: [
          { id: "g", position: { x: 0, y: 0 }, extra: [{ x: 4, y: 0 }] },
          { id: "n1", position: { x: 0, y: 2 } },
          { id: "n2", position: { x: 1.6, y: 2 } },
          { id: "n3", position: { x: 4, y: 2 } },
        ],
        components: [
          { id: "V1", label: "Battery", type: "voltageSource", a: "n1", b: "g", voltage: a.V },
          { id: "S1", label: "Switch", type: "switch", a: "n1", b: "n2", closeAt: r6(0.5 * tau) },
          { id: "R1", label: "Resistor", type: "resistor", a: "n2", b: "n3", resistance: a.R },
          { id: "L1", label: "Inductor", type: "inductor", a: "n3", b: "g", inductance: a.L },
        ],
      },
      params: [P("R", "Resistance R", 1, 1000, 1, "Ω"), P("L", "Inductance L", 0.05, 10, 0.05, "H"), P("V", "Battery V", 1, 24, 0.5, "V")],
    });
  },
};

const rlc: TemplateDef = {
  name: "rlc",
  domain: "circuits",
  title: "Series RLC: ringing and resonance",
  description: "Step source V through R, L, C in series; also sweeps frequency to find resonance.",
  defaults: { V: 5, R: 10, L: 0.1, C: 0.00001 },
  argDocs: { V: ["step voltage", "V"], R: ["resistance", "Ω"], L: ["inductance", "H"], C: ["capacitance", "F"] },
  build: (a) => {
    const f0 = 1 / (2 * Math.PI * Math.sqrt(a.L * a.C));
    return base("rlc", "Series RLC circuit", "circuits", a, {
      duration: r6(Math.min(10 / f0, (4 * 2 * a.L) / Math.max(a.R, 1e-9) + 2 / f0)),
      question: "resonant frequency and ringing period",
      circuit: {
        ground: "g",
        nodes: [
          { id: "g", position: { x: 0, y: 0 }, extra: [{ x: 6, y: 0 }] },
          { id: "n1", position: { x: 0, y: 2 } },
          { id: "n2", position: { x: 1.5, y: 2 } },
          { id: "n3", position: { x: 3.5, y: 2 } },
          { id: "n4", position: { x: 6, y: 2 } },
        ],
        components: [
          { id: "V1", label: "Source", type: "voltageSource", a: "n1", b: "g", voltage: a.V },
          { id: "S1", label: "Switch", type: "switch", a: "n1", b: "n2", closeAt: r6(0.2 / f0) },
          { id: "R1", label: "Resistor", type: "resistor", a: "n2", b: "n3", resistance: a.R },
          { id: "L1", label: "Inductor", type: "inductor", a: "n3", b: "n4", inductance: a.L },
          { id: "C1", label: "Capacitor", type: "capacitor", a: "n4", b: "g", capacitance: a.C },
        ],
        acSweep: { source: "V1", probe: "R1", fStart: r6(f0 / 30), fStop: r6(f0 * 30), points: 300 },
      },
      params: [P("R", "Resistance R", 1, 200, 1, "Ω"), P("L", "Inductance L", 0.01, 1, 0.01, "H"), P("C", "Capacitance C", 0.000001, 0.0001, 0.000001, "F")],
    });
  },
};

const divider: TemplateDef = {
  name: "divider",
  domain: "circuits",
  title: "Voltage divider",
  description: "Battery V across two resistors R1 and R2 in series.",
  defaults: { V: 9, R1: 1000, R2: 2000 },
  argDocs: { V: ["battery voltage", "V"], R1: ["first resistor", "Ω"], R2: ["second resistor", "Ω"] },
  build: (a) =>
    base("divider", "Voltage divider", "circuits", a, {
      duration: 0.01,
      question: "current and the voltage across R1",
      circuit: {
        ground: "g",
        nodes: [
          { id: "g", position: { x: 0, y: 0 }, extra: [{ x: 3, y: 0 }] },
          { id: "n1", position: { x: 0, y: 2 } },
          { id: "n2", position: { x: 3, y: 2 } },
        ],
        components: [
          { id: "V1", label: "Battery", type: "voltageSource", a: "n1", b: "g", voltage: a.V },
          { id: "R1", label: "R₁", type: "resistor", a: "n1", b: "n2", resistance: a.R1 },
          { id: "R2", label: "R₂", type: "resistor", a: "n2", b: "g", resistance: a.R2 },
        ],
      },
      params: [P("R1", "R₁", 10, 10000, 10, "Ω"), P("R2", "R₂", 10, 10000, 10, "Ω"), P("V", "Battery V", 1, 24, 0.5, "V")],
    }),
};

const parallel: TemplateDef = {
  name: "parallel",
  domain: "circuits",
  title: "Lamps in parallel",
  description: "Battery V across three lamps/resistors R1, R2, R3 in parallel.",
  defaults: { V: 12, R1: 100, R2: 200, R3: 300 },
  argDocs: { V: ["battery voltage", "V"], R1: ["resistor 1", "Ω"], R2: ["resistor 2", "Ω"], R3: ["resistor 3", "Ω"] },
  build: (a) =>
    base("parallel", "Lamps in parallel", "circuits", a, {
      duration: 0.01,
      question: "equivalent resistance and total current",
      circuit: {
        ground: "g",
        nodes: [
          {
            id: "g",
            position: { x: 0, y: 0 },
            extra: [
              { x: 2, y: 0 },
              { x: 3.5, y: 0 },
              { x: 5, y: 0 },
            ],
          },
          {
            id: "n1",
            position: { x: 0, y: 2 },
            extra: [
              { x: 2, y: 2 },
              { x: 3.5, y: 2 },
              { x: 5, y: 2 },
            ],
          },
        ],
        components: [
          { id: "V1", label: "Battery", type: "voltageSource", a: "n1", b: "g", voltage: a.V },
          { id: "R1", label: "Lamp 1", type: "lamp", a: "n1", b: "g", resistance: a.R1 },
          { id: "R2", label: "Lamp 2", type: "lamp", a: "n1", b: "g", resistance: a.R2 },
          { id: "R3", label: "Lamp 3", type: "lamp", a: "n1", b: "g", resistance: a.R3 },
        ],
      },
      params: [
        P("R1", "Lamp 1", 10, 1000, 5, "Ω"),
        P("R2", "Lamp 2", 10, 1000, 5, "Ω"),
        P("R3", "Lamp 3", 10, 1000, 5, "Ω"),
        P("V", "Battery V", 1, 24, 0.5, "V"),
      ],
    }),
};

const bridge: TemplateDef = {
  name: "bridge",
  domain: "circuits",
  title: "Wheatstone bridge",
  description: "Classic bridge: battery V, R1/R2 on the left arm, R3/Rx on the right, galvanometer Rg across the middle.",
  defaults: { V: 10, R1: 100, R2: 200, R3: 150, Rx: 280, Rg: 50 },
  argDocs: { V: ["battery", "V"], R1: ["R1", "Ω"], R2: ["R2", "Ω"], R3: ["R3", "Ω"], Rx: ["unknown resistor", "Ω"], Rg: ["galvanometer", "Ω"] },
  build: (a) =>
    base("bridge", "Wheatstone bridge", "circuits", a, {
      duration: 0.01,
      question: "is the bridge balanced? current through the galvanometer",
      circuit: {
        ground: "g",
        nodes: [
          { id: "g", position: { x: 0, y: 0 }, extra: [{ x: 3, y: 0 }] },
          { id: "top", position: { x: 0, y: 4 }, extra: [{ x: 3, y: 4 }] },
          { id: "left", position: { x: 2, y: 2 } },
          { id: "right", position: { x: 4, y: 2 } },
        ],
        components: [
          { id: "V1", label: "Battery", type: "voltageSource", a: "top", b: "g", voltage: a.V },
          { id: "R1", label: "R₁", type: "resistor", a: "top", b: "left", resistance: a.R1 },
          { id: "R2", label: "R₂", type: "resistor", a: "left", b: "g", resistance: a.R2 },
          { id: "R3", label: "R₃", type: "resistor", a: "top", b: "right", resistance: a.R3 },
          { id: "Rx", label: "Rₓ", type: "resistor", a: "right", b: "g", resistance: a.Rx },
          { id: "G", label: "Galvanometer", type: "resistor", a: "left", b: "right", resistance: a.Rg },
        ],
      },
      params: [P("Rx", "Unknown Rₓ", 10, 1000, 1, "Ω"), P("R3", "R₃", 10, 1000, 1, "Ω"), P("V", "Battery V", 1, 24, 0.5, "V")],
    }),
};

/* ───────────────────────────── optics ───────────────────────────── */

const thinLens: TemplateDef = {
  name: "thinLens",
  domain: "optics",
  title: "Lens forming an image",
  description: "A point object at distance d_o in front of a thin lens of focal length f (negative = diverging), at height h above the axis.",
  defaults: { f: 0.6, do: 1.5, h: 0.25 },
  argDocs: { f: ["focal length", "m"], do: ["object distance", "m"], h: ["object height", "m"] },
  build: (a) => {
    const spread = (2 * Math.atan(0.55 / Math.hypot(a.do, a.h)) * 180) / Math.PI;
    const centre = (Math.atan2(-a.h, a.do) * 180) / Math.PI;
    return base("thinLens", a.f > 0 ? "Converging lens" : "Diverging lens", "optics", a, {
      question: "image distance and magnification",
      optics: {
        elements: [{ id: "lens", type: "thinLens", position: { x: 0, y: 0 }, focalLength: a.f, height: 1.4 }],
        sources: [{ id: "object", type: "point", origin: { x: -a.do, y: a.h }, angle: r6(centre), spread: r6(spread), count: 9 }],
        worldSize: 4,
      },
      params: [
        P("do", "Object distance d_o", 0.2, 3.5, 0.05, "m"),
        P("f", "Focal length f", -1.5, 1.5, 0.05, "m"),
        P("h", "Object height", -0.5, 0.5, 0.05, "m"),
      ],
    });
  },
};

const concaveMirror: TemplateDef = {
  name: "concaveMirror",
  domain: "optics",
  title: "Concave mirror focus",
  description: "A parallel beam of light hits a concave spherical mirror of radius R.",
  defaults: { R: 2.4, width: 0.3 },
  argDocs: { R: ["radius of curvature", "m"], width: ["beam width", "m"] },
  build: (a) =>
    base("concaveMirror", "Concave mirror focus", "optics", a, {
      question: "focal length",
      optics: {
        elements: [
          { id: "mirror", type: "sphericalMirror", vertex: { x: 2, y: 0 }, radius: a.R, concave: true, height: Math.min(1.6, a.R * 0.9), facingAngle: 180 },
        ],
        sources: [{ id: "sun", type: "beam", origin: { x: -2.5, y: 0 }, angle: 0, width: a.width, count: 9 }],
        worldSize: 3.5,
      },
      params: [P("R", "Radius R", 1, 6, 0.1, "m"), P("width", "Beam width", 0.05, 1.4, 0.05, "m")],
    }),
};

const snell: TemplateDef = {
  name: "snell",
  domain: "optics",
  title: "Refraction into glass (Snell's law)",
  description: "A single ray in air hits a flat glass slab (index n) at `angle` degrees from the normal.",
  defaults: { n: 1.5, angle: 40 },
  argDocs: { n: ["refractive index", ""], angle: ["angle of incidence", "°"] },
  build: (a) => {
    const th = deg2rad(a.angle);
    const L = 1.6;
    return base("snell", "Refraction (Snell's law)", "optics", a, {
      question: "angle of refraction",
      optics: {
        elements: [
          {
            id: "glass",
            type: "block",
            refractiveIndex: a.n,
            vertices: [
              { x: 0, y: -2 },
              { x: 1.2, y: -2 },
              { x: 1.2, y: 1.2 },
              { x: 0, y: 1.2 },
            ],
          },
        ],
        sources: [{ id: "laser", type: "ray", origin: { x: r6(-L * Math.cos(th)), y: r6(L * Math.sin(th)) }, angle: -a.angle, color: "#ff5a36" }],
        worldSize: 3,
      },
      params: [P("angle", "Angle of incidence θ₁", 0, 85, 1, "°"), P("n", "Refractive index n", 1, 2.5, 0.01)],
    });
  },
};

const tir: TemplateDef = {
  name: "tir",
  domain: "optics",
  title: "Total internal reflection",
  description: "A ray enters a semicircular glass block (index n) through its curved face, aimed at the centre, meeting the flat face at `angle` degrees.",
  defaults: { n: 1.5, angle: 45 },
  argDocs: { n: ["refractive index", ""], angle: ["angle at the flat face", "°"] },
  build: (a) => {
    const th = deg2rad(a.angle);
    return base("tir", "Total internal reflection", "optics", a, {
      question: "critical angle",
      optics: {
        elements: [{ id: "block", type: "semicircle", center: { x: 0, y: 0 }, radius: 1.4, flatNormalAngle: 0, refractiveIndex: a.n }],
        sources: [{ id: "laser", type: "ray", origin: { x: r6(-2.4 * Math.cos(th)), y: r6(-2.4 * Math.sin(th)) }, angle: a.angle, color: "#ff5a36" }],
        worldSize: 3,
      },
      params: [P("angle", "Angle at flat face", 0, 85, 0.5, "°"), P("n", "Refractive index n", 1.1, 2.5, 0.01)],
    });
  },
};

const thickLens: TemplateDef = {
  name: "thickLens",
  domain: "optics",
  title: "Real glass lens (lensmaker)",
  description: "A parallel beam through a real biconvex glass lens with surface radii R1 > 0, R2 < 0, thickness d and index n.",
  defaults: { n: 1.5, R1: 1, R2: -1, d: 0.2, width: 0.5 },
  argDocs: { n: ["refractive index", ""], R1: ["front radius", "m"], R2: ["back radius (negative)", "m"], d: ["thickness", "m"], width: ["beam width", "m"] },
  build: (a) =>
    base("thickLens", "Real glass lens", "optics", a, {
      question: "focal length",
      optics: {
        elements: [{ id: "lens", type: "sphericalLens", position: { x: -0.6, y: 0 }, r1: a.R1, r2: a.R2, thickness: a.d, height: 1, refractiveIndex: a.n }],
        sources: [{ id: "beam", type: "beam", origin: { x: -3, y: 0 }, angle: 0, width: a.width, count: 13 }],
        worldSize: 3.5,
      },
      params: [P("n", "Refractive index n", 1.2, 2, 0.01), P("R1", "Front radius R₁", 0.6, 4, 0.05, "m"), P("width", "Beam width", 0.05, 0.9, 0.05, "m")],
    }),
};

const prism: TemplateDef = {
  name: "prism",
  domain: "optics",
  title: "Glass prism",
  description: "A ray passes through an equilateral glass prism of index n, entering at `angle` degrees.",
  defaults: { n: 1.5, angle: 45 },
  argDocs: { n: ["refractive index", ""], angle: ["ray direction", "°"] },
  build: (a) => {
    const s = 1.8;
    return base("prism", "Glass prism", "optics", a, {
      question: "how the ray bends",
      optics: {
        elements: [
          {
            id: "prism",
            type: "block",
            refractiveIndex: a.n,
            vertices: [
              { x: -s / 2, y: -0.6 },
              { x: s / 2, y: -0.6 },
              { x: 0, y: r6(-0.6 + (s * Math.sqrt(3)) / 2) },
            ],
          },
        ],
        sources: [{ id: "laser", type: "ray", origin: { x: -2.5, y: -0.4 }, angle: r6(a.angle - 30), color: "#ff5a36" }],
        worldSize: 3,
      },
      params: [P("angle", "Ray angle", 0, 40, 0.5, "°"), P("n", "Refractive index n", 1.1, 2.4, 0.01)],
    });
  },
};

export const TEMPLATES: Record<string, TemplateDef> = Object.fromEntries(
  [
    inclinePulley,
    atwood,
    inclineBlock,
    slidingStop,
    pendulum,
    springMass,
    verticalSpring,
    projectile,
    dragFall,
    collision,
    rcCharge,
    rcDischarge,
    rl,
    rlc,
    divider,
    parallel,
    bridge,
    thinLens,
    concaveMirror,
    snell,
    tir,
    thickLens,
    prism,
  ].map((t) => [t.name, t]),
);

export function buildTemplate(name: string, args: Partial<Args> = {}): SceneInput {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`unknown template "${name}"`);
  const merged: Args = { ...t.defaults };
  for (const [k, v] of Object.entries(args)) if (typeof v === "number" && Number.isFinite(v) && k in t.defaults) merged[k] = v;
  return t.build(merged);
}
