/**
 * LabLens circuit engine — Modified Nodal Analysis (MNA), written from scratch.
 *
 * Unknowns x = [node voltages (ground removed) | branch currents of voltage sources & inductors].
 * Each component "stamps" its contribution into G·x = z:
 *   resistor / lamp / switch   conductance stamp
 *   current source             right-hand side only
 *   voltage source             extra row/column (branch current unknown)
 *   capacitor (transient)      companion model: conductance Geq ∥ history current source
 *                              trapezoidal: Geq = 2C/Δt,  BE: Geq = C/Δt
 *   inductor  (transient)      branch row  Va − Vb − Zeq·i = history voltage
 *                              trapezoidal: Zeq = 2L/Δt,  BE: Zeq = L/Δt
 * AC analysis re-uses the same stamps with complex admittances jωC and impedances jωL.
 *
 * Sign convention: every component's current i flows a → b *through the component*,
 * v = V(a) − V(b), and absorbed power p = v·i (negative = delivering).
 */
import { solveLinear, solveComplex, cabs, type Complex } from "../math/linalg";
import type { CircuitScene, Component } from "../schema/scene";

export interface CircuitFrame {
  t: number;
  nodeV: number[]; // indexed like scene.nodes
  compV: number[]; // indexed like scene.components
  compI: number[];
  compP: number[];
  /** Energy stored in capacitors + inductors (J). */
  stored: number;
}

export interface CircuitResult {
  frames: CircuitFrame[];
  nodeIds: string[];
  componentIds: string[];
  stats: {
    method: string;
    dt: number;
    steps: number;
    maxKclResidual: number;
    maxCurrent: number;
    /** max |Σ p| / Σ|p| (Tellegen's theorem) */
    maxTellegen: number;
    /** |E_sources − E_dissipated − ΔE_stored| / E_sources, % */
    energyResidualPct: number;
    wallMs: number;
  };
  events: { t: number; message: string }[];
}

type Mode =
  | { kind: "dc" }
  | { kind: "init"; t: number } // t⁺ after a discontinuity: C as voltage sources, L as current sources
  | { kind: "tran"; dt: number; trap: boolean; t: number }
  | { kind: "ac" };

/** Ideal switch state. A switch is a branch: closed → V(a) = V(b); open → i = 0 (exact, no tiny/huge R). */
function switchClosed(closeAt: number, mode: Mode): boolean {
  const tol = 1e-12 * Math.max(1, closeAt);
  switch (mode.kind) {
    case "dc":
      return closeAt <= 0;
    case "ac":
      return true;
    case "init":
      return mode.t >= closeAt - tol;
    case "tran":
      return mode.t > closeAt + tol;
  }
}

interface History {
  capV: number[];
  capI: number[];
  indI: number[];
  indV: number[];
}

export class Circuit {
  readonly nodeIndex: Map<string, number>; // non-ground nodes → row
  readonly branchIndex: Map<string, number>; // component id → extra row
  readonly size: number;

  constructor(readonly scene: CircuitScene) {
    this.nodeIndex = new Map();
    let k = 0;
    for (const n of scene.nodes) if (n.id !== scene.ground) this.nodeIndex.set(n.id, k++);
    this.branchIndex = new Map();
    for (const c of scene.components) if (c.type === "voltageSource" || c.type === "inductor" || c.type === "switch") this.branchIndex.set(c.id, k++);
    this.size = k;
  }

  private sourceV(c: Extract<Component, { type: "voltageSource" }>, t: number) {
    return c.voltage + (c.acAmplitude > 0 && c.frequency > 0 ? c.acAmplitude * Math.sin(2 * Math.PI * c.frequency * t) : 0);
  }

  /** Assemble and solve the real MNA system for the given mode. */
  solve(mode: Mode, hist: History): number[] {
    if (mode.kind === "ac") throw new Error("use acProbe() for AC analysis");
    const N = this.size;
    // in "init" mode capacitors become voltage sources → need extra rows
    const capRows = new Map<string, number>();
    let extra = N;
    if (mode.kind === "init") for (const c of this.scene.components) if (c.type === "capacitor") capRows.set(c.id, extra++);
    const A: number[][] = Array.from({ length: extra }, () => new Array<number>(extra).fill(0));
    const z = new Array<number>(extra).fill(0);
    const idx = (node: string) => (node === this.scene.ground ? -1 : this.nodeIndex.get(node)!);
    const stampG = (a: number, b: number, g: number) => {
      if (a >= 0) A[a][a] += g;
      if (b >= 0) A[b][b] += g;
      if (a >= 0 && b >= 0) {
        A[a][b] -= g;
        A[b][a] -= g;
      }
    };
    const stampI = (a: number, b: number, i: number) => {
      // current i flowing a → b through the element: leaves a, enters b
      if (a >= 0) z[a] -= i;
      if (b >= 0) z[b] += i;
    };
    const stampBranch = (a: number, b: number, k: number, Z: number, E: number) => {
      if (a >= 0) {
        A[a][k] += 1;
        A[k][a] += 1;
      }
      if (b >= 0) {
        A[b][k] -= 1;
        A[k][b] -= 1;
      }
      A[k][k] -= Z;
      z[k] = E;
    };
    let ci = 0,
      li = 0;
    const t = mode.kind === "tran" ? mode.t : 0;
    for (const c of this.scene.components) {
      const a = idx(c.a),
        b = idx(c.b);
      switch (c.type) {
        case "resistor":
        case "lamp":
          stampG(a, b, 1 / c.resistance);
          break;
        case "switch": {
          const k = this.branchIndex.get(c.id)!;
          if (switchClosed(c.closeAt, mode)) stampBranch(a, b, k, 0, 0);
          else {
            if (a >= 0) A[a][k] += 1;
            if (b >= 0) A[b][k] -= 1;
            A[k][k] = 1; // i = 0
            z[k] = 0;
          }
          break;
        }
        case "currentSource":
          stampI(a, b, c.current);
          break;
        case "voltageSource":
          stampBranch(a, b, this.branchIndex.get(c.id)!, 0, mode.kind === "dc" ? c.voltage : this.sourceV(c, t));
          break;
        case "capacitor": {
          if (mode.kind === "dc") {
            stampG(a, b, 1e-12); // open circuit (tiny leak keeps the matrix regular)
          } else if (mode.kind === "init") {
            stampBranch(a, b, capRows.get(c.id)!, 0, hist.capV[ci]);
          } else {
            const geq = (mode.trap ? 2 : 1) * (c.capacitance / mode.dt);
            const ieq = mode.trap ? -(geq * hist.capV[ci] + hist.capI[ci]) : -geq * hist.capV[ci];
            stampG(a, b, geq);
            stampI(a, b, ieq);
          }
          ci++;
          break;
        }
        case "inductor": {
          const k = this.branchIndex.get(c.id)!;
          if (mode.kind === "dc") stampBranch(a, b, k, 0, 0);
          else if (mode.kind === "init") {
            // fix branch current: row becomes i = I0
            if (a >= 0) A[a][k] += 1;
            if (b >= 0) A[b][k] -= 1;
            A[k][k] = 1;
            z[k] = hist.indI[li];
          } else {
            const Z = (mode.trap ? 2 : 1) * (c.inductance / mode.dt);
            const E = mode.trap ? -Z * hist.indI[li] - hist.indV[li] : -Z * hist.indI[li];
            stampBranch(a, b, k, Z, E);
          }
          li++;
          break;
        }
      }
    }
    const x = solveLinear(A, z);
    // append capacitor currents (init mode) after the regular unknowns
    return x;
  }

  /** Per-component voltage/current/power from a solution vector. */
  readout(x: number[], mode: Mode, hist: History): Omit<CircuitFrame, "t"> {
    if (mode.kind === "ac") throw new Error("use acProbe() for AC analysis");
    const V = (node: string) => (node === this.scene.ground ? 0 : x[this.nodeIndex.get(node)!]);
    const nodeV = this.scene.nodes.map((n) => V(n.id));
    const compV: number[] = [],
      compI: number[] = [];
    let ci = 0,
      li = 0,
      capExtra = this.size,
      stored = 0;
    for (const c of this.scene.components) {
      const v = V(c.a) - V(c.b);
      let i = 0;
      switch (c.type) {
        case "resistor":
        case "lamp":
          i = v / c.resistance;
          break;
        case "switch":
          i = x[this.branchIndex.get(c.id)!];
          break;
        case "currentSource":
          i = c.current;
          break;
        case "voltageSource":
          i = x[this.branchIndex.get(c.id)!];
          break;
        case "capacitor":
          if (mode.kind === "dc") i = v * 1e-12;
          else if (mode.kind === "init") i = x[capExtra++];
          else {
            const geq = (mode.trap ? 2 : 1) * (c.capacitance / mode.dt);
            i = mode.trap ? geq * v - (geq * hist.capV[ci] + hist.capI[ci]) : geq * (v - hist.capV[ci]);
          }
          stored += 0.5 * c.capacitance * v * v;
          ci++;
          break;
        case "inductor":
          i = x[this.branchIndex.get(c.id)!];
          stored += 0.5 * c.inductance * i * i;
          li++;
          break;
      }
      compV.push(v);
      compI.push(i);
    }
    void li;
    return { nodeV, compV, compI, compP: compV.map((v, k) => v * compI[k]), stored };
  }

  /** KCL residual: max over nodes of |Σ currents leaving|. */
  kclResidual(f: Omit<CircuitFrame, "t">): number {
    const sum = new Map<string, number>();
    this.scene.components.forEach((c, k) => {
      sum.set(c.a, (sum.get(c.a) ?? 0) + f.compI[k]);
      sum.set(c.b, (sum.get(c.b) ?? 0) - f.compI[k]);
    });
    let worst = 0;
    for (const [node, s] of sum) if (node !== this.scene.ground) worst = Math.max(worst, Math.abs(s));
    return worst;
  }

  /** DC operating point (capacitors open, inductors shorted). */
  dc(): Omit<CircuitFrame, "t"> {
    const h = this.emptyHistory();
    return this.readout(this.solve({ kind: "dc" }, h), { kind: "dc" }, h);
  }

  emptyHistory(): History {
    const caps = this.scene.components.filter((c) => c.type === "capacitor") as Extract<Component, { type: "capacitor" }>[];
    const inds = this.scene.components.filter((c) => c.type === "inductor") as Extract<Component, { type: "inductor" }>[];
    return { capV: caps.map((c) => c.initialVoltage), capI: caps.map(() => 0), indI: inds.map((c) => c.initialCurrent), indV: inds.map(() => 0) };
  }

  /** Complex AC solve at frequency f (Hz) with unit amplitude on `sourceId`. Returns probe voltage phasor. */
  acProbe(f: number, sourceId: string, probeId: string): { mag: number; phase: number } {
    const w = 2 * Math.PI * f;
    const N = this.size;
    const A: Complex[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => [0, 0] as Complex));
    const z: Complex[] = Array.from({ length: N }, () => [0, 0] as Complex);
    const idx = (node: string) => (node === this.scene.ground ? -1 : this.nodeIndex.get(node)!);
    const add = (r: number, c: number, v: Complex) => {
      A[r][c] = [A[r][c][0] + v[0], A[r][c][1] + v[1]];
    };
    const stampY = (a: number, b: number, y: Complex) => {
      if (a >= 0) add(a, a, y);
      if (b >= 0) add(b, b, y);
      if (a >= 0 && b >= 0) {
        add(a, b, [-y[0], -y[1]]);
        add(b, a, [-y[0], -y[1]]);
      }
    };
    const stampBranch = (a: number, b: number, k: number, Z: Complex, E: number) => {
      if (a >= 0) {
        add(a, k, [1, 0]);
        add(k, a, [1, 0]);
      }
      if (b >= 0) {
        add(b, k, [-1, 0]);
        add(k, b, [-1, 0]);
      }
      add(k, k, [-Z[0], -Z[1]]);
      z[k] = [E, 0];
    };
    for (const c of this.scene.components) {
      const a = idx(c.a),
        b = idx(c.b);
      if (c.type === "resistor" || c.type === "lamp") stampY(a, b, [1 / c.resistance, 0]);
      else if (c.type === "switch") stampBranch(a, b, this.branchIndex.get(c.id)!, [0, 0], 0);
      else if (c.type === "capacitor") stampY(a, b, [0, w * c.capacitance]);
      else if (c.type === "inductor") stampBranch(a, b, this.branchIndex.get(c.id)!, [0, w * c.inductance], 0);
      else if (c.type === "voltageSource") stampBranch(a, b, this.branchIndex.get(c.id)!, [0, 0], c.id === sourceId ? 1 : 0);
    }
    const x = solveComplex(A, z);
    const pc = this.scene.components.find((c) => c.id === probeId)!;
    const Va: Complex = pc.a === this.scene.ground ? [0, 0] : x[this.nodeIndex.get(pc.a)!];
    const Vb: Complex = pc.b === this.scene.ground ? [0, 0] : x[this.nodeIndex.get(pc.b)!];
    const v: Complex = [Va[0] - Vb[0], Va[1] - Vb[1]];
    return { mag: cabs(v), phase: Math.atan2(v[1], v[0]) };
  }
}

/** Pick a time step from the circuit's fastest natural time scale. */
export function autoTimeStep(scene: CircuitScene, duration: number): number {
  // resolve the fastest RC, L/R or 1/ω₀ scale with ≥ 200 steps, and the run with ≥ 4000
  let fastest = Infinity;
  const Rs = scene.components.filter((c) => c.type === "resistor" || c.type === "lamp").map((c) => (c as { resistance: number }).resistance);
  const Rmin = Rs.length ? Math.min(...Rs) : 1;
  const Rmax = Rs.length ? Math.max(...Rs) : 1;
  for (const c of scene.components) {
    if (c.type === "capacitor") fastest = Math.min(fastest, Rmin * c.capacitance);
    if (c.type === "inductor") fastest = Math.min(fastest, c.inductance / Rmax);
  }
  const Ls = scene.components.filter((c) => c.type === "inductor").map((c) => (c as { inductance: number }).inductance);
  const Cs = scene.components.filter((c) => c.type === "capacitor").map((c) => (c as { capacitance: number }).capacitance);
  if (Ls.length && Cs.length) fastest = Math.min(fastest, Math.sqrt(Math.min(...Ls) * Math.min(...Cs)));
  return Math.min(duration / 4000, Math.max(Number.isFinite(fastest) ? fastest / 200 : Infinity, duration / 20000));
}

export function simulateCircuit(
  scene: CircuitScene,
  duration: number,
  opts: { dt?: number; method?: CircuitScene["method"]; samples?: number } = {},
): CircuitResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const ckt = new Circuit(scene);
  const method = opts.method ?? scene.method;
  const dt = opts.dt ?? scene.dt ?? autoTimeStep(scene, duration);
  const hist = ckt.emptyHistory();
  const events: { t: number; message: string }[] = [];

  const caps: number[] = [],
    inds: number[] = [];
  scene.components.forEach((c, k) => {
    if (c.type === "capacitor") caps.push(k);
    if (c.type === "inductor") inds.push(k);
  });
  const updateHist = (f: Omit<CircuitFrame, "t">) => {
    caps.forEach((k, j) => {
      hist.capV[j] = f.compV[k];
      hist.capI[j] = f.compI[k];
    });
    inds.forEach((k, j) => {
      hist.indI[j] = f.compI[k];
      hist.indV[j] = f.compV[k];
    });
  };
  /** Consistent state just after time t: capacitor voltages and inductor currents are continuous. */
  const initAt = (t: number): Omit<CircuitFrame, "t"> => {
    const m: Mode = { kind: "init", t };
    try {
      return ckt.readout(ckt.solve(m, hist), m, hist);
    } catch {
      // e.g. an ideal source directly across a capacitor: fall back to a tiny BE step
      const be: Mode = { kind: "tran", dt: dt * 1e-6, trap: false, t: t + dt * 1e-6 };
      return ckt.readout(ckt.solve(be, hist), be, hist);
    }
  };

  const f0 = initAt(0);
  updateHist(f0);
  const frames: CircuitFrame[] = [{ t: 0, ...f0 }];
  let maxKcl = ckt.kclResidual(f0);
  let maxI = Math.max(...f0.compI.map(Math.abs));
  const tellegen = (f: Omit<CircuitFrame, "t">) => {
    const sum = f.compP.reduce((a, p) => a + p, 0);
    const mag = f.compP.reduce((a, p) => a + Math.abs(p), 0);
    return mag > 1e-15 ? Math.abs(sum) / mag : 0;
  };
  let maxTel = tellegen(f0);

  // energy bookkeeping (trapezoidal in time)
  let eSrc = 0,
    eDiss = 0;
  const E0 = f0.stored;
  const srcPower = (f: Omit<CircuitFrame, "t">) =>
    scene.components.reduce((sum, c, k) => sum + (c.type === "voltageSource" || c.type === "currentSource" ? -f.compP[k] : 0), 0);
  const dissPower = (f: Omit<CircuitFrame, "t">) =>
    scene.components.reduce((sum, c, k) => sum + (c.type === "resistor" || c.type === "lamp" ? f.compP[k] : 0), 0);
  let prev = f0;

  // switch instants are hit exactly; after each one the state is re-initialised consistently,
  // so the trapezoidal rule never sees an inconsistent history (no numerical ringing)
  const breaks = [
    ...new Set(scene.components.filter((c) => c.type === "switch" && c.closeAt > 0 && c.closeAt < duration).map((c) => (c as { closeAt: number }).closeAt)),
  ].sort((a, b) => a - b);
  const trap = method === "trapezoidal";
  let t = 0,
    n = 0,
    lastSample = 0;
  const sampleDt = duration / (opts.samples ?? 600);
  while (t < duration - 1e-12 * duration) {
    const nextBreak = breaks.find((b) => b > t + 1e-12 * duration);
    const h = Math.min(dt, duration - t, nextBreak !== undefined ? nextBreak - t : Infinity);
    const tn = nextBreak !== undefined && Math.abs(t + h - nextBreak) < 1e-12 * duration ? nextBreak : t + h;
    const mode: Mode = { kind: "tran", dt: tn - t, trap, t: tn };
    const f = ckt.readout(ckt.solve(mode, hist), mode, hist);
    n++;
    maxKcl = Math.max(maxKcl, ckt.kclResidual(f));
    maxI = Math.max(maxI, ...f.compI.map(Math.abs));
    maxTel = Math.max(maxTel, tellegen(f));
    eSrc += 0.5 * (srcPower(prev) + srcPower(f)) * (tn - t);
    eDiss += 0.5 * (dissPower(prev) + dissPower(f)) * (tn - t);
    updateHist(f);
    prev = f;
    t = tn;
    const isBreak = nextBreak !== undefined && tn === nextBreak;
    if (isBreak || t - lastSample >= sampleDt - 1e-15 || t >= duration - 1e-12 * duration) {
      frames.push({ t, ...f });
      lastSample = t;
    }
    if (isBreak) {
      const g = initAt(t);
      events.push({ t, message: "The switch closes" });
      updateHist(g);
      prev = g;
      frames.push({ t, ...g });
      maxKcl = Math.max(maxKcl, ckt.kclResidual(g));
    }
  }
  const steps = n;
  const dE = prev.stored - E0;
  const scale = Math.max(Math.abs(eSrc), Math.abs(eDiss), Math.abs(dE), 1e-15);
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    frames,
    nodeIds: scene.nodes.map((n) => n.id),
    componentIds: scene.components.map((c) => c.id),
    events,
    stats: {
      method,
      dt,
      steps,
      maxKclResidual: maxKcl,
      maxCurrent: maxI,
      maxTellegen: maxTel,
      energyResidualPct: (Math.abs(eSrc - eDiss - dE) / scale) * 100,
      wallMs: t1 - t0,
    },
  };
}

/** Log-spaced AC sweep of the probe voltage magnitude. */
export function acSweep(scene: CircuitScene): { f: number[]; mag: number[]; phase: number[] } | null {
  const s = scene.acSweep;
  if (!s) return null;
  const ckt = new Circuit(scene);
  const f: number[] = [],
    mag: number[] = [],
    phase: number[] = [];
  const l0 = Math.log10(s.fStart),
    l1 = Math.log10(s.fStop);
  for (let i = 0; i < s.points; i++) {
    const fi = 10 ** (l0 + ((l1 - l0) * i) / (s.points - 1));
    const r = ckt.acProbe(fi, s.source, s.probe);
    f.push(fi);
    mag.push(r.mag);
    phase.push(r.phase);
  }
  return { f, mag, phase };
}

/** Find the frequency of maximum probe response by golden-section search in log-frequency. */
export function findResonance(scene: CircuitScene): number {
  const s = scene.acSweep!;
  const ckt = new Circuit(scene);
  const h = (lf: number) => ckt.acProbe(10 ** lf, s.source, s.probe).mag;
  // coarse grid first to bracket the peak
  const sw = acSweep(scene)!;
  let k = 0;
  for (let i = 1; i < sw.mag.length; i++) if (sw.mag[i] > sw.mag[k]) k = i;
  let a = Math.log10(sw.f[Math.max(0, k - 1)]),
    b = Math.log10(sw.f[Math.min(sw.f.length - 1, k + 1)]);
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a),
    d = a + gr * (b - a);
  let fc = h(c),
    fd = h(d);
  for (let i = 0; i < 100 && b - a > 1e-13; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = h(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = h(d);
    }
  }
  return 10 ** ((a + b) / 2);
}
