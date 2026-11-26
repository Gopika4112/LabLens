/**
 * Offline Socratic tutor: Predict → Experiment → Explain.
 *
 * The tutor never states the answer first. It asks for a committed prediction, runs the
 * experiment on the real engine, and *grades the prediction against the simulation*
 * (the correct choice is computed from the measured before/after ratio, not hard-coded).
 */
import type { Scene } from "../schema/scene";

export type ChoiceId = "more2" | "double" | "up" | "same" | "down" | "halve";

export const CHOICES: { id: ChoiceId; label: string }[] = [
  { id: "more2", label: "More than doubles" },
  { id: "double", label: "About doubles" },
  { id: "up", label: "Increases, but less than double" },
  { id: "same", label: "Stays about the same" },
  { id: "down", label: "Decreases (but not to half)" },
  { id: "halve", label: "Halves or less" },
];

export interface Experiment {
  id: string;
  question: string;
  paramId: string;
  /** Returns the new parameter value from the current one. */
  change: (v: number) => number;
  changeLabel: string;
  quantityId: string;
  quantityLabel: string;
  /** Reflection prompt shown after the result — a question, not an answer. */
  reflect: string;
}

const scale =
  (k: number) =>
  (v: number): number =>
    v * k;
const set = (x: number) => (): number => x;

const LIB: Record<string, Omit<Experiment, "id">[]> = {
  atwood: [
    {
      question: "If you double the right-hand mass m₂, what happens to the acceleration?",
      paramId: "m2",
      change: scale(2),
      changeLabel: "double m₂",
      quantityId: "a",
      quantityLabel: "acceleration",
      reflect:
        "m₂ appears in the top AND the bottom of a = (m₂ − m₁)g/(m₁ + m₂). Which effect wins as m₂ grows huge? What is the largest acceleration possible?",
    },
    {
      question: "If both masses are made equal, what happens to the tension compared with now?",
      paramId: "m2",
      change: () => NaN, // replaced at run time by m1's value
      changeLabel: "set m₂ = m₁",
      quantityId: "T",
      quantityLabel: "tension",
      reflect: "With equal masses nothing accelerates. What must the tension equal then? Is it bigger or smaller than when the system was moving?",
    },
  ],
  inclinePulley: [
    {
      question: "If you double the friction coefficient μk, what happens to the acceleration?",
      paramId: "muK",
      change: (v) => Math.max(0.05, v * 2),
      changeLabel: "double μk",
      quantityId: "a",
      quantityLabel: "acceleration",
      reflect: "Friction subtracts μk·m₁g·cosθ from the driving force. Why didn't the acceleration simply halve?",
    },
    {
      question: "If you make the incline steeper (θ → 50°), what happens to the acceleration toward the pulley?",
      paramId: "angle",
      change: set(50),
      changeLabel: "set θ = 50°",
      quantityId: "a",
      quantityLabel: "acceleration",
      reflect: "On a steeper slope gravity pulls the block back down harder. Which term in the free-body diagram grew, and which shrank?",
    },
    {
      question: "If you double the hanging mass m₂, what happens to the rope tension?",
      paramId: "m2",
      change: scale(2),
      changeLabel: "double m₂",
      quantityId: "T",
      quantityLabel: "tension",
      reflect: "The hanging mass accelerates downward, so T < m₂g. Look at the free-body diagram: does the tension keep up with m₂g?",
    },
  ],
  inclineBlock: [
    {
      question: "If you double the block's mass, what happens to its acceleration down the incline?",
      paramId: "m",
      change: scale(2),
      changeLabel: "double the mass",
      quantityId: "a",
      quantityLabel: "acceleration",
      reflect: "Weight, normal force and friction all scale with m. What does that tell you about a = F/m?",
    },
    {
      question: "If you make the slope shallower (θ → 15°), what happens to the acceleration?",
      paramId: "angle",
      change: set(15),
      changeLabel: "set θ = 15°",
      quantityId: "a",
      quantityLabel: "acceleration",
      reflect: "Compare tan θ with μs. What decides whether the block moves at all?",
    },
  ],
  slidingStop: [
    {
      question: "If you double the starting speed, what happens to the stopping distance?",
      paramId: "v0",
      change: scale(2),
      changeLabel: "double v₀",
      quantityId: "d",
      quantityLabel: "stopping distance",
      reflect: "Kinetic energy is ½mv². If friction does the same work per metre, how far must it act to remove four times the energy?",
    },
  ],
  pendulum: [
    {
      question: "If you double the bob's mass, what happens to the period?",
      paramId: "m",
      change: scale(2),
      changeLabel: "double the mass",
      quantityId: "T",
      quantityLabel: "period",
      reflect: "Galileo noticed this in a cathedral. Why does mass cancel out of the pendulum's motion?",
    },
    {
      question: "If you make the string 4× longer, what happens to the period?",
      paramId: "L",
      change: (v) => Math.min(2.8, v * 4),
      changeLabel: "4× the length (capped at 2.8 m)",
      quantityId: "T",
      quantityLabel: "period",
      reflect: "T ∝ √L. Check: did the period change by the square root of the length ratio?",
    },
    {
      question: "If you release it from 80° instead, what happens to the period?",
      paramId: "angle",
      change: set(80),
      changeLabel: "set θ₀ = 80°",
      quantityId: "T",
      quantityLabel: "period",
      reflect: "The textbook formula 2π√(L/g) assumes small angles. Look at the note under the verification badge — how wrong is it now?",
    },
  ],
  springMass: [
    {
      question: "If you double the amplitude, what happens to the period?",
      paramId: "amplitude",
      change: scale(2),
      changeLabel: "double the amplitude",
      quantityId: "T",
      quantityLabel: "period",
      reflect: "A bigger stretch means a bigger force, but also further to travel. Why do these exactly cancel for an ideal spring?",
    },
    {
      question: "If you make the spring 4× stiffer, what happens to the period?",
      paramId: "k",
      change: (v) => Math.min(200, v * 4),
      changeLabel: "4× the spring constant",
      quantityId: "T",
      quantityLabel: "period",
      reflect: "T = 2π√(m/k). Did the period change by the factor you'd expect from a square root?",
    },
  ],
  projectile: [
    {
      question: "If you double the launch speed, what happens to the range?",
      paramId: "v0",
      change: (v) => Math.min(25, v * 2),
      changeLabel: "double v₀",
      quantityId: "R",
      quantityLabel: "range",
      reflect: "Doubling v₀ doubles both the horizontal speed and the time in the air. What does that do to the product?",
    },
  ],
  collision: [
    {
      question: "If cart 2 becomes much heavier (6 kg), what happens to cart 1's velocity after the collision?",
      paramId: "m2",
      change: set(6),
      changeLabel: "set m₂ = 6 kg",
      quantityId: "v1",
      quantityLabel: "cart 1's final velocity",
      reflect: "Imagine bouncing a ball off a wall. What happens to the light object when it hits something very heavy?",
    },
  ],
  dragFall: [
    {
      question: "If the ball is 4× heavier (same size), what happens to its terminal speed?",
      paramId: "m",
      change: (v) => Math.min(5, v * 4),
      changeLabel: "4× the mass",
      quantityId: "vt",
      quantityLabel: "terminal speed",
      reflect: "At terminal speed, drag balances weight: c·v² = mg. What does that predict?",
    },
  ],
  rcCharge: [
    {
      question: "If you double the resistance, what happens to the time constant?",
      paramId: "R",
      change: (v) => Math.min(10000, v * 2),
      changeLabel: "double R",
      quantityId: "tau",
      quantityLabel: "time constant",
      reflect: "A bigger resistor lets less current flow. How does that change how long the capacitor takes to fill?",
    },
    {
      question: "If you double the battery voltage, what happens to the time constant?",
      paramId: "V",
      change: (v) => Math.min(24, v * 2),
      changeLabel: "double V",
      quantityId: "tau",
      quantityLabel: "time constant",
      reflect: "More voltage pushes more current, but the capacitor also has twice as far to go. Which one wins?",
    },
  ],
  rcDischarge: [
    {
      question: "If you double the capacitance, what happens to the time constant?",
      paramId: "C",
      change: (v) => Math.min(0.005, v * 2),
      changeLabel: "double C",
      quantityId: "tau",
      quantityLabel: "time constant",
      reflect: "τ = RC. Does a bigger 'bucket' drain faster or slower through the same pipe?",
    },
  ],
  rl: [
    {
      question: "If you double the resistance, what happens to the final current?",
      paramId: "R",
      change: (v) => Math.min(1000, v * 2),
      changeLabel: "double R",
      quantityId: "If",
      quantityLabel: "final current",
      reflect: "Once the current is steady, what voltage is across the inductor? So what is left to limit the current?",
    },
  ],
  rlc: [
    {
      question: "If you quadruple the capacitance, what happens to the resonant frequency?",
      paramId: "C",
      change: (v) => Math.min(0.0001, v * 4),
      changeLabel: "4× C",
      quantityId: "f0",
      quantityLabel: "resonant frequency",
      reflect: "f₀ = 1/(2π√(LC)). Which way does the square root push it, and by how much?",
    },
    {
      question: "If you increase the resistance from 10 Ω to 40 Ω, what happens to the resonant frequency?",
      paramId: "R",
      change: set(40),
      changeLabel: "set R = 40 Ω",
      quantityId: "f0",
      quantityLabel: "resonant frequency",
      reflect: "Resistance makes the peak wider and lower. Does it move the peak? Look at the frequency-response plot.",
    },
  ],
  divider: [
    {
      question: "If you double R₂, what happens to the voltage across R₁?",
      paramId: "R2",
      change: (v) => Math.min(10000, v * 2),
      changeLabel: "double R₂",
      quantityId: "V1",
      quantityLabel: "voltage across R₁",
      reflect: "The battery's voltage is shared in proportion to resistance. Who gets a bigger share now?",
    },
  ],
  parallel: [
    {
      question: "If you double lamp 1's resistance, what happens to the total current?",
      paramId: "R1",
      change: (v) => Math.min(1000, v * 2),
      changeLabel: "double R₁",
      quantityId: "I",
      quantityLabel: "total current",
      reflect: "Each branch sees the full battery voltage. Which branch's current changed — and did the others notice?",
    },
  ],
  bridge: [
    {
      question: "If you set Rₓ to 300 Ω, what happens to the galvanometer current?",
      paramId: "Rx",
      change: set(300),
      changeLabel: "set Rₓ = 300 Ω",
      quantityId: "Ig",
      quantityLabel: "galvanometer current",
      reflect: "A balanced bridge has R₁/R₂ = R₃/Rₓ. What value of Rₓ balances it here?",
    },
  ],
  thinLens: [
    {
      question: "If you move the object further from the lens (d_o → 3 m), what happens to the image distance?",
      paramId: "do",
      change: set(3),
      changeLabel: "set d_o = 3 m",
      quantityId: "di",
      quantityLabel: "image distance",
      reflect: "As the object goes to infinity, where must the image end up? (Think about parallel rays.)",
    },
  ],
  concaveMirror: [
    {
      question: "If you double the mirror's radius of curvature, what happens to the focal length?",
      paramId: "R",
      change: (v) => Math.min(6, v * 2),
      changeLabel: "double R",
      quantityId: "f",
      quantityLabel: "focal length",
      reflect: "Widen the beam with its slider. Do the edge rays still meet at the same point? That's spherical aberration.",
    },
  ],
  snell: [
    {
      question: "If you double the angle of incidence (40° → 80°), what happens to the angle of refraction?",
      paramId: "angle",
      change: set(80),
      changeLabel: "set θ₁ = 80°",
      quantityId: "theta2",
      quantityLabel: "angle of refraction",
      reflect: "Snell's law relates sines, not angles. Is sin 80° twice sin 40°?",
    },
  ],
  tir: [
    {
      question: "If you change the glass to diamond (n = 2.42), what happens to the critical angle?",
      paramId: "n",
      change: set(2.42),
      changeLabel: "set n = 2.42",
      quantityId: "thc",
      quantityLabel: "critical angle",
      reflect: "Why do diamonds sparkle? Think about how much light gets trapped inside by total internal reflection.",
    },
  ],
  thickLens: [
    {
      question: "If you use glass with a higher index (n = 1.8), what happens to the back focal distance?",
      paramId: "n",
      change: set(1.8),
      changeLabel: "set n = 1.8",
      quantityId: "bfd",
      quantityLabel: "back focal distance",
      reflect: "The lensmaker's equation has (n − 1) out front. What happens to the lens's power?",
    },
  ],
};

export function experimentsFor(scene: Scene): Experiment[] {
  const name = scene.template?.name;
  const lib = (name && LIB[name]) || [];
  const available = new Set(scene.params.map((p) => p.id));
  return lib
    .filter((e) => available.has(e.paramId))
    .map((e, i) => {
      const exp: Experiment = { ...e, id: `${name}-${i}` };
      if (name === "atwood" && e.changeLabel === "set m₂ = m₁") {
        const m1 = scene.template!.args.m1;
        exp.change = () => m1;
      }
      return exp;
    });
}

/** Classify the measured change; this is what "the right answer" is graded against. */
export function classifyChange(before: number, after: number): ChoiceId {
  const b = Math.abs(before),
    a = Math.abs(after);
  if (b < 1e-12) return a < 1e-12 ? "same" : "more2";
  const r = a / b;
  if (r > 2.1) return "more2";
  if (r >= 1.9) return "double";
  if (r > 1.03) return "up";
  if (r >= 0.97) return "same";
  if (r > 0.55) return "down";
  return "halve";
}

export function feedback(pred: ChoiceId, actual: ChoiceId, before: number, after: number, label: string, unit: string): string {
  const ratio = Math.abs(before) > 1e-12 ? Math.abs(after) / Math.abs(before) : NaN;
  const nums = `The ${label} went from ${before.toPrecision(3)} to ${after.toPrecision(3)} ${unit}${Number.isFinite(ratio) ? ` (×${ratio.toFixed(2)})` : ""}.`;
  const close =
    (pred === "up" && actual === "double") ||
    (pred === "double" && (actual === "up" || actual === "more2")) ||
    (pred === "down" && actual === "halve") ||
    (pred === "halve" && actual === "down");
  if (pred === actual) return `Your prediction matches the experiment. ${nums}`;
  if (close) return `Close — right direction, different size. ${nums}`;
  return `The experiment disagrees with your prediction — that's the interesting part. ${nums}`;
}
