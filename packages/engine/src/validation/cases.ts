/**
 * The Engine Accuracy suite. One list, two consumers:
 *   - Vitest runs every case and asserts error ≤ tolerance (CI gate),
 *   - the in-app "Engine Accuracy" page runs the same cases live in the browser.
 * Every analytic value is a closed-form textbook result computed independently of the engine.
 */
import { EXAMPLES, exampleScene } from "../examples";
import { runScene } from "../run";
import { MechanicsScene, type MechanicsScene as MechScene } from "../schema/scene";
import { MechanicsSim, simulateMechanics } from "../mechanics/engine";
import { ellipticK, percentError } from "../math/numeric";
import { sceneFrom } from "../schema/validate";
import { buildTemplate } from "../templates";

export interface CaseResult {
  analytic: number;
  simulated: number;
  unit: string;
  errorPct: number;
  formula: string;
}

export interface ValidationCase {
  id: string;
  domain: "mechanics" | "circuits" | "optics" | "numerics";
  name: string;
  /** Pass threshold on |sim − analytic| / |analytic|, in %. */
  tolerancePct: number;
  run: () => CaseResult;
}

/** Case built from an example's verification quantity. */
function fromExample(exampleId: string, quantityId: string, name: string, tolerancePct: number, override?: Record<string, number>): ValidationCase {
  const ex = EXAMPLES.find((e) => e.id === exampleId)!;
  return {
    id: `${exampleId}:${quantityId}${override ? ":" + Object.values(override).join("-") : ""}`,
    domain: buildTemplate(ex.template).domain,
    name,
    tolerancePct,
    run: () => {
      const scene = override ? sceneFrom({ ...buildTemplate(ex.template, { ...ex.args, ...override }), id: ex.id }) : exampleScene(exampleId);
      const out = runScene(scene);
      const qq = out.verification.quantities.find((x) => x.id === quantityId);
      if (!qq) throw new Error(`quantity ${quantityId} not produced for ${exampleId}`);
      return { analytic: qq.analytic, simulated: qq.simulated, unit: qq.unit, errorPct: qq.errorPct, formula: qq.formula };
    },
  };
}

/**
 * Observed order of accuracy p from the global error at a fixed time with Δt and Δt/2 on an
 * undamped oscillator. The error is measured in the full state (x and v), at a generic
 * instant (0.37 T) so no symmetry hides it.
 */
function convergenceOrder(integrator: MechScene["integrator"]): CaseResult {
  const k = 40,
    m = 1,
    A = 0.3;
  const w = Math.sqrt(k / m);
  const tEnd = 0.37 * ((2 * Math.PI) / w);
  const err = (steps: number) => {
    const dt = tEnd / steps;
    const sc = MechanicsScene.parse({
      gravity: 0,
      integrator,
      dt,
      bodies: [{ id: "m", mass: m, position: { x: 1 + A, y: 0 }, collides: false }],
      springs: [{ id: "s", bodyA: "m", anchorB: { x: 0, y: 0 }, k, restLength: 1 }],
    });
    const sim = new MechanicsSim(sc);
    for (let i = 0; i < steps; i++) sim.step(dt);
    const dx = sim.q[0] - (1 + A * Math.cos(w * tEnd));
    const dv = sim.v[0] - -A * w * Math.sin(w * tEnd);
    return Math.hypot(dx, dv / w);
  };
  const base = integrator === "rk4" ? 24 : 200;
  const e1 = err(base),
    e2 = err(2 * base);
  const p = Math.log2(e1 / e2);
  const expected = integrator === "rk4" ? 4 : integrator === "verlet" ? 2 : 1;
  return { analytic: expected, simulated: p, unit: "order", errorPct: percentError(p, expected), formula: "p = log₂(e(Δt) / e(Δt/2))" };
}

export const VALIDATION_CASES: ValidationCase[] = [
  // ── mechanics ──
  {
    id: "free-fall",
    domain: "mechanics",
    name: "Free fall: time to drop 10 m",
    tolerancePct: 1e-4,
    run: () => {
      const sc = MechanicsScene.parse({
        bodies: [{ id: "b", mass: 1, shape: "ball", size: 0.2, position: { x: 0, y: 10.1 } }],
        surfaces: [{ id: "g", from: { x: -5, y: 0 }, to: { x: 5, y: 0 }, restitution: 0 }],
      });
      const r = simulateMechanics(sc, { duration: 2 });
      const tSim = r.events.find((e) => e.kind === "land" || e.kind === "bounce")!.t;
      const t = Math.sqrt((2 * 10) / 9.81);
      return { analytic: t, simulated: tSim, unit: "s", errorPct: percentError(tSim, t), formula: "t = √(2h/g)" };
    },
  },
  fromExample("atwood", "a", "Atwood machine: acceleration", 1e-6),
  fromExample("atwood", "T", "Atwood machine: tension", 1e-6),
  fromExample("incline-pulley", "a", "Incline + pulley with friction: acceleration", 1e-4),
  fromExample("incline-pulley", "T", "Incline + pulley with friction: tension", 1e-4),
  fromExample("table-pulley", "a", "Block on table + hanging mass", 1e-4),
  fromExample("incline-block", "a", "Block sliding down a rough incline", 1e-6),
  {
    id: "static-hold",
    domain: "mechanics",
    name: "Static friction holds a block (tanθ < μs)",
    tolerancePct: 1e-6,
    run: () => {
      const s = sceneFrom({ ...buildTemplate("inclineBlock", { angle: 20, muS: 0.5, muK: 0.4 }), id: "hold" });
      const r = simulateMechanics(s.mechanics!, { duration: 1 });
      const moved = Math.hypot(
        r.frames[r.frames.length - 1].bodies[0].x - r.frames[0].bodies[0].x,
        r.frames[r.frames.length - 1].bodies[0].y - r.frames[0].bodies[0].y,
      );
      return { analytic: 0, simulated: moved, unit: "m moved", errorPct: moved * 100, formula: "a = 0 when tanθ ≤ μs" };
    },
  },
  fromExample("sliding-stop", "d", "Sliding to a stop: distance", 1e-4),
  fromExample("spring", "T", "Simple harmonic motion: period", 1e-3),
  fromExample("vertical-spring", "T", "Damped oscillator: damped period", 1e-3),
  fromExample("pendulum", "T", "Pendulum at 40°: exact period", 1e-3),
  {
    id: "pendulum-80",
    domain: "mechanics",
    name: "Pendulum at 80°: exact period (elliptic integral)",
    tolerancePct: 1e-3,
    run: () => {
      const s = sceneFrom({ ...buildTemplate("pendulum", { L: 1, angle: 80, m: 1 }), id: "p80" });
      const out = runScene(s);
      const qq = out.verification.quantities.find((x) => x.id === "T")!;
      const check = 4 * Math.sqrt(1 / 9.81) * ellipticK(Math.sin((80 * Math.PI) / 360));
      return { analytic: check, simulated: qq.simulated, unit: "s", errorPct: percentError(qq.simulated, check), formula: qq.formula };
    },
  },
  fromExample("pendulum", "Tmax", "Pendulum: string tension at the bottom", 1e-3),
  fromExample("projectile", "R", "Projectile: horizontal range", 1e-3),
  fromExample("projectile", "H", "Projectile: maximum height", 1e-6),
  fromExample("drag", "vt", "Terminal velocity with quadratic drag", 0.01),
  fromExample("collision", "v1", "Elastic collision: final velocity", 1e-9),
  {
    id: "energy-drift",
    domain: "mechanics",
    name: "Energy conservation: pendulum over 20 s",
    tolerancePct: 1e-4,
    run: () => {
      const s = sceneFrom({ ...buildTemplate("pendulum", { L: 1.2, angle: 60, m: 1 }), id: "drift", duration: 20 });
      const r = simulateMechanics(s.mechanics!, { duration: 20 });
      const e = r.frames.map((f) => f.energy.kinetic + f.energy.potential);
      const drift = Math.max(...e.map((x) => Math.abs(x - e[0])));
      const scale = Math.max(...r.frames.map((f) => f.energy.kinetic));
      return { analytic: 0, simulated: drift, unit: "J", errorPct: (drift / scale) * 100, formula: "KE + PE = const" };
    },
  },
  // ── numerics ──
  { id: "order-rk4", domain: "numerics", name: "RK4 convergence order", tolerancePct: 5, run: () => convergenceOrder("rk4") },
  { id: "order-verlet", domain: "numerics", name: "Velocity Verlet convergence order", tolerancePct: 5, run: () => convergenceOrder("verlet") },
  { id: "order-euler", domain: "numerics", name: "Semi-implicit Euler convergence order", tolerancePct: 10, run: () => convergenceOrder("symplectic-euler") },
  // ── circuits ──
  fromExample("rc-charge", "tau", "RC charging: time constant τ = RC", 0.01),
  fromExample("rc-charge", "i0", "RC charging: initial current V/R", 1e-6),
  fromExample("rc-discharge", "tau", "RC discharging: time constant", 0.01),
  fromExample("rl", "tau", "RL circuit: time constant τ = L/R", 0.01),
  fromExample("rlc", "f0", "Series RLC: resonant frequency", 1e-5),
  fromExample("rlc", "Td", "Series RLC: damped ringing period", 0.01),
  fromExample("divider", "V1", "Voltage divider", 1e-9),
  fromExample("parallel", "Req", "Parallel resistors: equivalent resistance", 1e-9),
  fromExample("bridge", "Ig", "Wheatstone bridge: galvanometer current", 1e-9),
  // ── optics ──
  fromExample("snell", "theta2", "Snell's law: angle of refraction", 1e-9),
  fromExample("snell", "shift", "Glass slab: lateral displacement", 1e-9),
  fromExample("tir", "thc", "Critical angle for total internal reflection", 1e-6),
  fromExample("lens", "di", "Thin lens equation: image distance", 1e-9),
  fromExample("lens", "m", "Thin lens: magnification", 1e-9),
  fromExample("magnifier", "di", "Thin lens: virtual image", 1e-9),
  fromExample("mirror", "f", "Concave mirror: focal length R/2", 1e-4),
  fromExample("thick-lens", "bfd", "Thick lens: lensmaker back focal distance", 0.05),
];

export interface CaseOutcome {
  c: ValidationCase;
  result?: CaseResult;
  error?: string;
  pass: boolean;
  ms: number;
}

export function runCase(c: ValidationCase): CaseOutcome {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const result = c.run();
    const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { c, result, pass: Number.isFinite(result.errorPct) && result.errorPct <= c.tolerancePct, ms };
  } catch (e) {
    return { c, error: (e as Error).message, pass: false, ms: 0 };
  }
}
