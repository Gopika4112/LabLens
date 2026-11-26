/** The built-in example library: every one is a textbook-style problem the app can run offline. */
import type { Scene } from "./schema/scene";
import { sceneFrom } from "./schema/validate";
import { buildTemplate } from "./templates";

export interface Example {
  id: string;
  template: string;
  args: Record<string, number>;
  problemText: string;
  tags: string[];
}

export const EXAMPLES: Example[] = [
  {
    id: "incline-pulley",
    template: "inclinePulley",
    args: { m1: 2, m2: 3, angle: 30, muS: 0.25, muK: 0.2 },
    problemText:
      "A 2 kg block rests on a 30° incline (μs = 0.25, μk = 0.2). A rope over a pulley at the top connects it to a hanging 3 kg mass. Find the acceleration and the tension.",
    tags: ["forces", "friction", "pulleys"],
  },
  {
    id: "atwood",
    template: "atwood",
    args: { m1: 2, m2: 3 },
    problemText: "Two masses, 2 kg and 3 kg, hang from a light string over a frictionless pulley. Find the acceleration and the tension.",
    tags: ["forces", "pulleys"],
  },
  {
    id: "table-pulley",
    template: "inclinePulley",
    args: { m1: 4, m2: 1.5, angle: 0, muS: 0.2, muK: 0.15 },
    problemText: "A 4 kg block on a horizontal table (μk = 0.15) is pulled by a string over a pulley at the edge, attached to a 1.5 kg hanging mass.",
    tags: ["forces", "friction", "pulleys"],
  },
  {
    id: "incline-block",
    template: "inclineBlock",
    args: { m: 2, angle: 35, muS: 0.4, muK: 0.3 },
    problemText: "A 2 kg box is released from rest on a 35° ramp with μs = 0.4 and μk = 0.3. Does it slide? If so, with what acceleration?",
    tags: ["forces", "friction", "inclines"],
  },
  {
    id: "sliding-stop",
    template: "slidingStop",
    args: { m: 1, v0: 5, mu: 0.25 },
    problemText: "A hockey puck slides at 5 m/s across a rough floor with μk = 0.25. How far does it travel before stopping?",
    tags: ["friction", "kinematics"],
  },
  {
    id: "pendulum",
    template: "pendulum",
    args: { L: 1.5, angle: 40, m: 1 },
    problemText: "A 1 kg bob on a 1.5 m string is released from 40°. Find its period — is the small-angle formula still good?",
    tags: ["oscillations", "energy"],
  },
  {
    id: "spring",
    template: "springMass",
    args: { m: 1, k: 40, amplitude: 0.4, damping: 0 },
    problemText: "A 1 kg cart on a frictionless track is attached to a spring with k = 40 N/m, pulled 0.4 m and released. Find the period.",
    tags: ["oscillations", "SHM"],
  },
  {
    id: "vertical-spring",
    template: "verticalSpring",
    args: { m: 1, k: 30, damping: 0.8 },
    problemText: "A 1 kg mass hangs from a spring (k = 30 N/m) with a little damping, released from the spring's natural length. Where does it settle?",
    tags: ["oscillations", "damping"],
  },
  {
    id: "projectile",
    template: "projectile",
    args: { v0: 14, angle: 50, h0: 1.5 },
    problemText: "A ball is thrown at 14 m/s, 50° above horizontal, from 1.5 m above the ground. Find the maximum height, time of flight and range.",
    tags: ["kinematics", "2D motion"],
  },
  {
    id: "drag",
    template: "dragFall",
    args: { m: 0.5, c: 0.02 },
    problemText: "A 0.5 kg ball falls with air resistance F = 0.02·v². What is its terminal speed?",
    tags: ["forces", "drag"],
  },
  {
    id: "collision",
    template: "collision",
    args: { m1: 1, u1: 2, m2: 2, u2: 0 },
    problemText: "A 1 kg cart moving at 2 m/s collides elastically with a 2 kg cart at rest. Find both velocities afterwards.",
    tags: ["momentum", "collisions"],
  },
  {
    id: "rc-charge",
    template: "rcCharge",
    args: { V: 5, R: 1000, C: 0.001 },
    problemText: "A 5 V battery charges a 1 mF capacitor through a 1 kΩ resistor. What is the time constant?",
    tags: ["circuits", "capacitors"],
  },
  {
    id: "rc-discharge",
    template: "rcDischarge",
    args: { V0: 9, R: 2000, C: 0.0005 },
    problemText: "A 0.5 mF capacitor charged to 9 V discharges through a 2 kΩ resistor. How long until it reaches 37% of 9 V?",
    tags: ["circuits", "capacitors"],
  },
  {
    id: "rl",
    template: "rl",
    args: { V: 12, R: 100, L: 2 },
    problemText: "A 12 V battery drives current through a 100 Ω resistor and a 2 H inductor. Find the time constant and final current.",
    tags: ["circuits", "inductors"],
  },
  {
    id: "rlc",
    template: "rlc",
    args: { V: 5, R: 10, L: 0.1, C: 0.00001 },
    problemText: "A series RLC circuit has R = 10 Ω, L = 0.1 H and C = 10 µF. Find its resonant frequency.",
    tags: ["circuits", "resonance", "AC"],
  },
  {
    id: "divider",
    template: "divider",
    args: { V: 9, R1: 1000, R2: 2000 },
    problemText: "A 9 V battery is connected across 1 kΩ and 2 kΩ resistors in series. Find the current and the voltage across each.",
    tags: ["circuits", "Ohm's law"],
  },
  {
    id: "parallel",
    template: "parallel",
    args: { V: 12, R1: 100, R2: 200, R3: 300 },
    problemText: "Three lamps of 100 Ω, 200 Ω and 300 Ω are connected in parallel to a 12 V battery. Find the equivalent resistance and total current.",
    tags: ["circuits", "parallel"],
  },
  {
    id: "bridge",
    template: "bridge",
    args: { V: 10, R1: 100, R2: 200, R3: 150, Rx: 280, Rg: 50 },
    problemText: "In a Wheatstone bridge with R1 = 100 Ω, R2 = 200 Ω, R3 = 150 Ω, what value of Rx balances the bridge?",
    tags: ["circuits", "networks"],
  },
  {
    id: "lens",
    template: "thinLens",
    args: { f: 0.6, do: 1.5, h: 0.25 },
    problemText: "An object 0.25 m tall is 1.5 m from a converging lens with f = 0.6 m. Where is the image and how big is it?",
    tags: ["optics", "lenses"],
  },
  {
    id: "magnifier",
    template: "thinLens",
    args: { f: 0.8, do: 0.5, h: 0.15 },
    problemText: "An object is placed 0.5 m from a lens of focal length 0.8 m (inside the focal length). Describe the image.",
    tags: ["optics", "lenses", "virtual image"],
  },
  {
    id: "mirror",
    template: "concaveMirror",
    args: { R: 2.4, width: 0.3 },
    problemText: "Parallel light strikes a concave mirror with a radius of curvature of 2.4 m. Where does it focus?",
    tags: ["optics", "mirrors"],
  },
  {
    id: "snell",
    template: "snell",
    args: { n: 1.5, angle: 40 },
    problemText: "Light in air hits glass (n = 1.5) at 40° to the normal. Find the angle of refraction.",
    tags: ["optics", "refraction"],
  },
  {
    id: "tir",
    template: "tir",
    args: { n: 1.5, angle: 45 },
    problemText: "Light inside glass (n = 1.5) hits the glass–air surface at 45°. Does it escape? What is the critical angle?",
    tags: ["optics", "total internal reflection"],
  },
  {
    id: "thick-lens",
    template: "thickLens",
    args: { n: 1.5, R1: 1, R2: -1, d: 0.2, width: 0.5 },
    problemText: "A biconvex glass lens (n = 1.5) has radii of 1 m and thickness 0.2 m. Where does a parallel beam focus?",
    tags: ["optics", "lenses", "lensmaker"],
  },
  {
    id: "prism",
    template: "prism",
    args: { n: 1.5, angle: 45 },
    problemText: "A ray of light passes through an equilateral glass prism (n = 1.5). Trace its path.",
    tags: ["optics", "refraction"],
  },
];

export function exampleScene(id: string): Scene {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new Error(`unknown example ${id}`);
  const s = buildTemplate(ex.template, ex.args);
  return sceneFrom({ ...s, id: ex.id, problemText: ex.problemText });
}
