/**
 * LabLens mechanics engine — constrained 2D particle dynamics, written from scratch.
 *
 * Model
 *   Every body is a point mass (rendered as a block or ball). Interactions are either
 *   - forces:        gravity, springs (+damping), linear/quadratic drag, applied forces
 *   - constraints:   surface contact (+Coulomb friction), ropes over ideal pulleys,
 *                    pendulum strings/rods
 *   - impulses:      bounces off surfaces and body–body collisions (restitution e)
 *
 * Constraint solve (each force evaluation)
 *   Each constraint i has a scalar position function Cᵢ(q) with Jacobian Jᵢ = ∂Cᵢ/∂q.
 *   Its force on the bodies is λᵢ·Fᵢ where Fᵢ = Jᵢᵀ for ideal constraints, and
 *   Fᵢ = n − μk·s·t (normal plus kinetic friction) for a sliding contact.
 *   Requiring C̈ᵢ = Jᵢ·a + J̇ᵢ·v = 0 with a = M⁻¹(F_ext + Σ λₖFₖ) gives the linear system
 *        Σₖ (Jᵢ M⁻¹ Fₖ) λₖ = −Jᵢ M⁻¹ F_ext − J̇ᵢ v
 *   solved by our own Gaussian elimination. Unilateral constraints (contacts push, ropes
 *   and strings only pull) use an active-set loop: any λ < 0 is released and we re-solve.
 *   Static friction adds a tangential "stick" row; if |λₜ| > μs·λₙ the contact slips.
 *
 * Time integration: RK4 (default), velocity Verlet, or semi-implicit (symplectic) Euler.
 * After every step we project positions and velocities back onto the active constraints
 * (a RATTLE-style projection), which removes drift without Baumgarte fudge factors.
 *
 * Energy audit: KE + PE is compared against E₀ + W_applied − W_dissipated at every step,
 * so every scene — even one with no textbook answer — carries a correctness check.
 */
import { solveLinear, SingularMatrixError } from "../math/linalg";
import type { MechanicsScene, Body, Surface } from "../schema/scene";

export interface V2 {
  x: number;
  y: number;
}

export type ForceKind = "gravity" | "normal" | "friction" | "tension" | "spring" | "drag" | "applied";

export interface ForceVec {
  kind: ForceKind;
  label: string;
  fx: number;
  fy: number;
}

export interface BodyFrame {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
}

export interface EnergyFrame {
  kinetic: number;
  potential: number;
  dissipated: number;
  applied: number;
  corrections: number;
  /** (KE + PE + dissipated − applied − corrections) − E₀ : should stay ≈ 0. */
  residual: number;
}

export interface MechFrame {
  t: number;
  bodies: BodyFrame[];
  forces: ForceVec[][];
  ropeTension: number[];
  ropeTaut: boolean[];
  linkTension: number[];
  springLength: number[];
  contacts: { body: number; surface: number; mode: "stick" | "slide" }[];
  energy: EnergyFrame;
}

export type MechEventKind =
  | "reach-pulley"
  | "leave-surface"
  | "slide-off-end"
  | "bounce"
  | "land"
  | "collision"
  | "max-height"
  | "comes-to-rest"
  | "starts-sliding"
  | "rope-slack"
  | "rope-taut";

export interface MechEvent {
  t: number;
  kind: MechEventKind;
  body?: string;
  message: string;
}

export interface MechResult {
  frames: MechFrame[];
  events: MechEvent[];
  bodyIds: string[];
  ropeGuides: V2[][];
  stoppedEarly?: string;
  stats: {
    steps: number;
    dt: number;
    integrator: string;
    maxEnergyResidualPct: number;
    energyScale: number;
    wallMs: number;
  };
}

/* ───────────────────────── internal structures ───────────────────────── */

interface Contact {
  body: number;
  surface: number;
  n: V2; // unit normal, pointing to the body's side
  t: V2; // unit tangent from → to
  p0: V2;
  len: number;
  h: number;
  muS: number;
  muK: number;
  mode: "stick" | "slide";
  dir: number; // sliding direction along t (±1, 0 = unknown)
}

interface RopeGeo {
  a: number;
  b: number; // −1 → anchor
  anchor: V2 | null;
  guides: V2[];
  middle: number; // fixed length between first and last guide
  L: number;
}

interface LinkGeo {
  body: number;
  pivot: V2;
  L: number;
  rod: boolean;
}

interface Term {
  b: number;
  jx: number;
  jy: number;
  fx: number;
  fy: number;
}

interface Row {
  kind: "contact" | "stick" | "rope" | "link";
  ref: number; // index into contacts / ropes / links
  unilateral: boolean;
  terms: Term[];
  C: number;
  jdotv: number;
}

interface Eval {
  a: Float64Array;
  rows: Row[];
  lambda: number[];
  forces: ForceVec[][];
  /** power dissipated by friction + drag + spring damping (W, ≥ 0). */
  pDiss: number;
  /** power delivered by applied forces (W). */
  pApplied: number;
}

const SLACK_TOL = 1e-7;
const V_EPS = 1e-4;

const unit = (x: number, y: number): V2 => {
  const d = Math.hypot(x, y);
  return d > 0 ? { x: x / d, y: y / d } : { x: 0, y: 0 };
};

function guidePoint(p: { position: V2; radius: number }, side: string): V2 {
  const r = p.radius;
  switch (side) {
    case "left":
      return { x: p.position.x - r, y: p.position.y };
    case "right":
      return { x: p.position.x + r, y: p.position.y };
    case "top":
      return { x: p.position.x, y: p.position.y + r };
    default:
      return { x: p.position.x, y: p.position.y - r };
  }
}

export const bodyName = (b: Body) => b.label ?? b.id;

/* ─────────────────────────────── the engine ─────────────────────────────── */

export class MechanicsSim {
  readonly n: number;
  readonly m: Float64Array;
  readonly h: Float64Array;
  q: Float64Array;
  v: Float64Array;
  t = 0;
  contacts: Contact[] = [];
  ropes: RopeGeo[] = [];
  links: LinkGeo[] = [];
  events: MechEvent[] = [];
  dissipated = 0;
  appliedWork = 0;
  /** PE/KE changed by non-dynamic geometric fixes (push-out, snapping, projection). */
  corrections = 0;
  E0 = 0;
  /** Rope/string engagement is decided once per step (not per RK stage) so that stage
   *  points dipping a hair inside the circle are not mistaken for a slack string. */
  private ropeOn: boolean[] = [];
  private linkOn: boolean[] = [];
  private ropeWasTaut: boolean[] = [];
  private lastEval: Eval | null = null;
  private wasMoving: boolean[];
  private restLogged: boolean[] = [];
  private everMoved: boolean[];

  constructor(
    readonly scene: MechanicsScene,
    readonly bodyRestitution = 1,
  ) {
    const bs = scene.bodies;
    this.n = bs.length;
    this.m = Float64Array.from(bs.map((b) => b.mass));
    this.h = Float64Array.from(bs.map((b) => b.size / 2));
    this.q = new Float64Array(2 * this.n);
    this.v = new Float64Array(2 * this.n);
    bs.forEach((b, i) => {
      this.q[2 * i] = b.position.x;
      this.q[2 * i + 1] = b.position.y;
      this.v[2 * i] = b.velocity.x;
      this.v[2 * i + 1] = b.velocity.y;
    });
    this.wasMoving = bs.map((b) => Math.hypot(b.velocity.x, b.velocity.y) > 1e-3);
    this.everMoved = [...this.wasMoving];

    // contacts: snap bodies onto their surfaces
    bs.forEach((b, i) => {
      if (!b.onSurface) return;
      const si = scene.surfaces.findIndex((s) => s.id === b.onSurface);
      if (si < 0) return;
      this.attach(i, si, true);
    });

    const bodyIndex = new Map(bs.map((b, i) => [b.id, i]));
    const pulleys = new Map(scene.pulleys.map((p) => [p.id, p]));
    for (const r of scene.ropes) {
      const guides = r.via.map((v) => guidePoint(pulleys.get(v.pulley)!, v.side));
      let middle = 0;
      for (let k = 1; k < guides.length; k++) middle += Math.hypot(guides[k].x - guides[k - 1].x, guides[k].y - guides[k - 1].y);
      const geo: RopeGeo = {
        a: bodyIndex.get(r.bodyA)!,
        b: r.bodyB ? bodyIndex.get(r.bodyB)! : -1,
        anchor: r.bodyB ? null : r.anchorB!,
        guides,
        middle,
        L: 0,
      };
      geo.L = r.length ?? this.ropeLength(geo).len;
      this.ropes.push(geo);
      this.ropeWasTaut.push(true);
    }
    for (const l of scene.links) {
      const i = bodyIndex.get(l.body)!;
      const L = l.length ?? Math.hypot(this.q[2 * i] - l.pivot.x, this.q[2 * i + 1] - l.pivot.y);
      this.links.push({ body: i, pivot: l.pivot, L, rod: l.kind === "rod" });
    }
    // If an explicit rope/link length is given, start consistent with it.
    this.projectPositions();
    this.projectVelocities();
    this.decideFriction();
    this.E0 = this.kinetic() + this.potential();
  }

  /* ────────────── geometry helpers ────────────── */

  private pos(i: number): V2 {
    return { x: this.q[2 * i], y: this.q[2 * i + 1] };
  }

  private attach(i: number, si: number, snap: boolean) {
    const s: Surface = this.scene.surfaces[si];
    const t = unit(s.to.x - s.from.x, s.to.y - s.from.y);
    let n = { x: -t.y, y: t.x };
    const side = n.x * (this.q[2 * i] - s.from.x) + n.y * (this.q[2 * i + 1] - s.from.y);
    if (side < -1e-12 || (Math.abs(side) <= 1e-12 && n.y < 0)) n = { x: -n.x, y: -n.y };
    const len = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
    const c: Contact = {
      body: i,
      surface: si,
      n,
      t,
      p0: s.from,
      len,
      h: this.h[i],
      muS: Math.max(s.muStatic, s.muKinetic),
      muK: s.muKinetic,
      mode: "slide",
      dir: 0,
    };
    if (snap) {
      // project onto the line, clamp to the segment, offset by half-size
      let sAlong = t.x * (this.q[2 * i] - s.from.x) + t.y * (this.q[2 * i + 1] - s.from.y);
      sAlong = Math.min(len, Math.max(0, sAlong));
      this.q[2 * i] = s.from.x + t.x * sAlong + n.x * c.h;
      this.q[2 * i + 1] = s.from.y + t.y * sAlong + n.y * c.h;
      // remove velocity into the surface
      const vn = this.v[2 * i] * n.x + this.v[2 * i + 1] * n.y;
      this.v[2 * i] -= vn * n.x;
      this.v[2 * i + 1] -= vn * n.y;
    }
    this.contacts = this.contacts.filter((k) => k.body !== i);
    this.contacts.push(c);
  }

  private ropeLength(r: RopeGeo, q: Float64Array = this.q) {
    const pa = { x: q[2 * r.a], y: q[2 * r.a + 1] };
    const pb = r.b >= 0 ? { x: q[2 * r.b], y: q[2 * r.b + 1] } : r.anchor!;
    const ga = r.guides.length ? r.guides[0] : pb;
    const gb = r.guides.length ? r.guides[r.guides.length - 1] : pa;
    const dA = Math.hypot(ga.x - pa.x, ga.y - pa.y);
    const dB = r.guides.length ? Math.hypot(gb.x - pb.x, gb.y - pb.y) : 0;
    return { len: dA + r.middle + dB, dA, dB, pa, pb, ga, gb };
  }

  /* ────────────── constraint rows ────────────── */

  private buildRows(q: Float64Array, v: Float64Array, withStick: boolean): Row[] {
    const rows: Row[] = [];
    this.contacts.forEach((c, ci) => {
      const i = c.body;
      const px = q[2 * i],
        py = q[2 * i + 1];
      const C = c.n.x * (px - c.p0.x) + c.n.y * (py - c.p0.y) - c.h;
      let fx = c.n.x,
        fy = c.n.y;
      if (c.mode === "slide" && c.muK > 0 && c.dir !== 0) {
        fx -= c.muK * c.dir * c.t.x;
        fy -= c.muK * c.dir * c.t.y;
      }
      rows.push({ kind: "contact", ref: ci, unilateral: true, C, jdotv: 0, terms: [{ b: i, jx: c.n.x, jy: c.n.y, fx, fy }] });
      if (withStick && c.mode === "stick") {
        rows.push({ kind: "stick", ref: ci, unilateral: false, C: 0, jdotv: 0, terms: [{ b: i, jx: c.t.x, jy: c.t.y, fx: c.t.x, fy: c.t.y }] });
      }
    });
    this.ropes.forEach((r, ri) => {
      const g = this.ropeLength(r, q);
      const C = r.L - g.len;
      if (!(this.ropeOn[ri] ?? C <= SLACK_TOL)) return; // slack: no constraint
      const terms: Term[] = [];
      let jdotv = 0;
      const addEnd = (b: number, p: V2, guide: V2, d: number) => {
        if (d < 1e-9) return;
        const u = { x: (guide.x - p.x) / d, y: (guide.y - p.y) / d };
        const vx = v[2 * b],
          vy = v[2 * b + 1];
        const vu = vx * u.x + vy * u.y;
        jdotv += -(vx * vx + vy * vy - vu * vu) / d;
        const existing = terms.find((t) => t.b === b);
        if (existing) {
          existing.jx += u.x;
          existing.jy += u.y;
          existing.fx += u.x;
          existing.fy += u.y;
        } else terms.push({ b, jx: u.x, jy: u.y, fx: u.x, fy: u.y });
      };
      addEnd(r.a, g.pa, g.ga, g.dA);
      if (r.b >= 0 && r.guides.length) addEnd(r.b, g.pb, g.gb, g.dB);
      if (r.b >= 0 && !r.guides.length) {
        // direct rope between two bodies: treat as A pulled toward B and B toward A
        const d = g.dA;
        if (d > 1e-9) {
          const u = { x: (g.pb.x - g.pa.x) / d, y: (g.pb.y - g.pa.y) / d };
          const rvx = v[2 * r.b] - v[2 * r.a],
            rvy = v[2 * r.b + 1] - v[2 * r.a + 1];
          const ru = rvx * u.x + rvy * u.y;
          terms.length = 0;
          terms.push({ b: r.a, jx: u.x, jy: u.y, fx: u.x, fy: u.y }, { b: r.b, jx: -u.x, jy: -u.y, fx: -u.x, fy: -u.y });
          jdotv = -(rvx * rvx + rvy * rvy - ru * ru) / d;
        }
      }
      if (terms.length) rows.push({ kind: "rope", ref: ri, unilateral: true, C, jdotv, terms });
    });
    this.links.forEach((l, li) => {
      const i = l.body;
      const dx = l.pivot.x - q[2 * i],
        dy = l.pivot.y - q[2 * i + 1];
      const d = Math.hypot(dx, dy);
      if (d < 1e-12) return;
      const C = l.L - d;
      if (!l.rod && !(this.linkOn[li] ?? C <= SLACK_TOL)) return;
      const u = { x: dx / d, y: dy / d };
      const vx = v[2 * i],
        vy = v[2 * i + 1];
      const vu = vx * u.x + vy * u.y;
      rows.push({
        kind: "link",
        ref: li,
        unilateral: !l.rod,
        C,
        jdotv: -(vx * vx + vy * vy - vu * vu) / d,
        terms: [{ b: i, jx: u.x, jy: u.y, fx: u.x, fy: u.y }],
      });
    });
    return rows;
  }

  /** Solve for multipliers with an active-set loop on unilateral rows. */
  private solveRows(rows: Row[], rhsOf: (r: Row) => number, useF = true): { active: Row[]; lambda: number[] } {
    let active = rows.slice();
    for (let iter = 0; iter <= rows.length; iter++) {
      if (!active.length) return { active, lambda: [] };
      const k = active.length;
      const A: number[][] = [];
      const b: number[] = [];
      for (let i = 0; i < k; i++) {
        const row = new Array<number>(k).fill(0);
        for (let j = 0; j < k; j++) {
          let s = 0;
          for (const ti of active[i].terms)
            for (const tj of active[j].terms) if (ti.b === tj.b) s += (ti.jx * (useF ? tj.fx : tj.jx) + ti.jy * (useF ? tj.fy : tj.jy)) / this.m[ti.b];
          row[j] = s;
        }
        A.push(row);
        b.push(rhsOf(active[i]));
      }
      let lambda: number[];
      try {
        lambda = solveLinear(A, b);
      } catch (e) {
        if (!(e instanceof SingularMatrixError)) throw e;
        // redundant constraints: regularise slightly and retry
        for (let i = 0; i < k; i++) A[i][i] += 1e-10 * (1 + Math.abs(A[i][i]));
        lambda = solveLinear(A, b, 0);
      }
      let worst = -1,
        worstVal = -1e-9;
      for (let i = 0; i < k; i++) {
        if (active[i].unilateral && lambda[i] < worstVal) {
          worstVal = lambda[i];
          worst = i;
        }
      }
      if (worst < 0) return { active, lambda };
      const dropped = active[worst];
      active = active.filter((r, i) => i !== worst && !(dropped.kind === "contact" && r.kind === "stick" && r.ref === dropped.ref));
    }
    return { active: [], lambda: [] };
  }

  /* ────────────── force evaluation ────────────── */

  evaluate(q: Float64Array, v: Float64Array): Eval {
    const { n, m, scene } = this;
    const g = scene.gravity;
    const F = new Float64Array(2 * n);
    const forces: ForceVec[][] = Array.from({ length: n }, () => []);
    let pDiss = 0,
      pApplied = 0;
    scene.bodies.forEach((b, i) => {
      const vx = v[2 * i],
        vy = v[2 * i + 1];
      if (g > 0) {
        F[2 * i + 1] -= m[i] * g;
        forces[i].push({ kind: "gravity", label: "Weight", fx: 0, fy: -m[i] * g });
      }
      const sp = Math.hypot(vx, vy);
      if ((b.dragLinear > 0 || b.dragQuadratic > 0) && sp > 0) {
        const k = b.dragLinear + b.dragQuadratic * sp;
        F[2 * i] -= k * vx;
        F[2 * i + 1] -= k * vy;
        forces[i].push({ kind: "drag", label: "Air drag", fx: -k * vx, fy: -k * vy });
        pDiss += k * sp * sp;
      }
      if (b.appliedForce && (b.appliedForce.x || b.appliedForce.y)) {
        F[2 * i] += b.appliedForce.x;
        F[2 * i + 1] += b.appliedForce.y;
        forces[i].push({ kind: "applied", label: "Applied", fx: b.appliedForce.x, fy: b.appliedForce.y });
        pApplied += b.appliedForce.x * vx + b.appliedForce.y * vy;
      }
    });
    const bodyIdx = new Map(scene.bodies.map((b, i) => [b.id, i]));
    for (const s of scene.springs) {
      const a = bodyIdx.get(s.bodyA)!;
      const bi = s.bodyB ? bodyIdx.get(s.bodyB)! : -1;
      const pb = bi >= 0 ? { x: q[2 * bi], y: q[2 * bi + 1] } : s.anchorB!;
      const dx = pb.x - q[2 * a],
        dy = pb.y - q[2 * a + 1];
      const d = Math.hypot(dx, dy) || 1e-12;
      const u = { x: dx / d, y: dy / d }; // from A toward B
      const vrel = bi >= 0 ? (v[2 * bi] - v[2 * a]) * u.x + (v[2 * bi + 1] - v[2 * a + 1]) * u.y : -(v[2 * a] * u.x + v[2 * a + 1] * u.y);
      const mag = s.k * (d - s.restLength) + s.damping * vrel; // >0 pulls A toward B
      F[2 * a] += mag * u.x;
      F[2 * a + 1] += mag * u.y;
      forces[a].push({ kind: "spring", label: "Spring", fx: mag * u.x, fy: mag * u.y });
      if (bi >= 0) {
        F[2 * bi] -= mag * u.x;
        F[2 * bi + 1] -= mag * u.y;
        forces[bi].push({ kind: "spring", label: "Spring", fx: -mag * u.x, fy: -mag * u.y });
      }
      pDiss += s.damping * vrel * vrel;
    }

    const rows = this.buildRows(q, v, true);
    const { active, lambda } = this.solveRows(rows, (r) => {
      let s = 0;
      for (const t of r.terms) s += (t.jx * F[2 * t.b] + t.jy * F[2 * t.b + 1]) / m[t.b];
      return -s - r.jdotv;
    });

    const a = new Float64Array(2 * n);
    for (let i = 0; i < 2 * n; i++) a[i] = F[i];
    active.forEach((r, k) => {
      const lam = lambda[k];
      for (const t of r.terms) {
        a[2 * t.b] += lam * t.fx;
        a[2 * t.b + 1] += lam * t.fy;
        const vx = v[2 * t.b],
          vy = v[2 * t.b + 1];
        if (r.kind === "contact") {
          const c = this.contacts[r.ref];
          const nx = lam * c.n.x,
            ny = lam * c.n.y;
          forces[t.b].push({ kind: "normal", label: "Normal", fx: nx, fy: ny });
          const frx = lam * t.fx - nx,
            fry = lam * t.fy - ny;
          if (Math.abs(frx) + Math.abs(fry) > 1e-12) {
            forces[t.b].push({ kind: "friction", label: "Kinetic friction", fx: frx, fy: fry });
            pDiss -= frx * vx + fry * vy;
          }
        } else if (r.kind === "stick") {
          forces[t.b].push({ kind: "friction", label: "Static friction", fx: lam * t.fx, fy: lam * t.fy });
        } else {
          forces[t.b].push({ kind: "tension", label: r.kind === "rope" ? "Tension" : "Tension (string)", fx: lam * t.fx, fy: lam * t.fy });
        }
      }
    });
    for (let i = 0; i < n; i++) {
      a[2 * i] /= m[i];
      a[2 * i + 1] /= m[i];
    }
    return { a, rows: active, lambda, forces, pDiss: Math.max(0, pDiss), pApplied };
  }

  /* ────────────── friction mode decisions (once per step) ────────────── */

  private decideFriction() {
    for (const c of this.contacts) {
      const vt = this.v[2 * c.body] * c.t.x + this.v[2 * c.body + 1] * c.t.y;
      if (Math.abs(vt) > V_EPS) {
        c.mode = "slide";
        c.dir = Math.sign(vt);
      } else if (c.muS > 0 || c.muK > 0) {
        c.mode = "stick";
      } else {
        c.mode = "slide";
        c.dir = 0;
      }
    }
    // iterate: release the worst violating stick contact until consistent
    for (let iter = 0; iter < this.contacts.length + 1; iter++) {
      const sticking = this.contacts.filter((c) => c.mode === "stick");
      if (!sticking.length) return;
      const ev = this.evaluate(this.q, this.v);
      let worst: Contact | null = null,
        worstExcess = 1e-12,
        worstSign = 0;
      for (const c of sticking) {
        const ci = this.contacts.indexOf(c);
        const kn = ev.rows.findIndex((r) => r.kind === "contact" && r.ref === ci);
        const kt = ev.rows.findIndex((r) => r.kind === "stick" && r.ref === ci);
        if (kt < 0) continue;
        const ln = kn >= 0 ? ev.lambda[kn] : 0;
        const lt = ev.lambda[kt];
        const excess = Math.abs(lt) - c.muS * ln;
        if (excess > worstExcess) {
          worstExcess = excess;
          worst = c;
          worstSign = Math.sign(lt);
        }
      }
      if (!worst) return;
      worst.mode = "slide";
      worst.dir = -worstSign; // impending motion is opposite to the friction that was needed
      if (worst.dir !== 0) this.emitOnce("starts-sliding", worst.body, `${this.label(worst.body)} overcomes static friction and starts sliding`);
    }
  }

  /* ────────────── projections (RATTLE-style) ────────────── */

  private projectPositions() {
    for (let it = 0; it < 3; it++) {
      const rows = this.buildRows(this.q, this.v, false).filter((r) =>
        r.kind === "contact" || (r.kind === "link" && !r.unilateral) ? Math.abs(r.C) > 1e-12 : r.C < -1e-12,
      );
      if (!rows.length) return;
      const { active, lambda } = this.solveRows(rows, (r) => -r.C, false);
      // λ here are position corrections; unilateral sign logic is irrelevant (we want C→0)
      active.forEach((r, k) => {
        for (const t of r.terms) {
          this.q[2 * t.b] += (lambda[k] * t.jx) / this.m[t.b];
          this.q[2 * t.b + 1] += (lambda[k] * t.jy) / this.m[t.b];
        }
      });
    }
  }

  private projectVelocities(): number {
    const keBefore = this.kinetic();
    const rows = this.buildRows(this.q, this.v, true).filter((r) => {
      const jv = r.terms.reduce((s, t) => s + t.jx * this.v[2 * t.b] + t.jy * this.v[2 * t.b + 1], 0);
      if (r.kind === "contact" || r.kind === "stick" || (r.kind === "link" && !r.unilateral)) return Math.abs(jv) > 1e-14;
      return jv < -1e-14; // ropes/strings: only stop them from stretching
    });
    if (!rows.length) return 0;
    const { active, lambda } = this.solveRows(rows, (r) => -r.terms.reduce((s, t) => s + t.jx * this.v[2 * t.b] + t.jy * this.v[2 * t.b + 1], 0), false);
    active.forEach((r, k) => {
      for (const t of r.terms) {
        this.v[2 * t.b] += (lambda[k] * t.jx) / this.m[t.b];
        this.v[2 * t.b + 1] += (lambda[k] * t.jy) / this.m[t.b];
      }
    });
    return keBefore - this.kinetic();
  }

  /* ────────────── energy ────────────── */

  kinetic(): number {
    let ke = 0;
    for (let i = 0; i < this.n; i++) ke += 0.5 * this.m[i] * (this.v[2 * i] ** 2 + this.v[2 * i + 1] ** 2);
    return ke;
  }

  potential(): number {
    let pe = 0;
    const g = this.scene.gravity;
    for (let i = 0; i < this.n; i++) pe += this.m[i] * g * this.q[2 * i + 1];
    const idx = new Map(this.scene.bodies.map((b, i) => [b.id, i]));
    for (const s of this.scene.springs) {
      const a = idx.get(s.bodyA)!;
      const bi = s.bodyB ? idx.get(s.bodyB)! : -1;
      const pb = bi >= 0 ? { x: this.q[2 * bi], y: this.q[2 * bi + 1] } : s.anchorB!;
      const d = Math.hypot(pb.x - this.q[2 * a], pb.y - this.q[2 * a + 1]);
      pe += 0.5 * s.k * (d - s.restLength) ** 2;
    }
    return pe;
  }

  /* ────────────── integration ────────────── */

  private rk4(dt: number) {
    const { q, v } = this;
    const N = q.length;
    const k1 = this.lastEval ?? this.evaluate(q, v);
    const q2 = new Float64Array(N),
      v2 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      q2[i] = q[i] + 0.5 * dt * v[i];
      v2[i] = v[i] + 0.5 * dt * k1.a[i];
    }
    const k2 = this.evaluate(q2, v2);
    const q3 = new Float64Array(N),
      v3 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      q3[i] = q[i] + 0.5 * dt * v2[i];
      v3[i] = v[i] + 0.5 * dt * k2.a[i];
    }
    const k3 = this.evaluate(q3, v3);
    const q4 = new Float64Array(N),
      v4 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      q4[i] = q[i] + dt * v3[i];
      v4[i] = v[i] + dt * k3.a[i];
    }
    const k4 = this.evaluate(q4, v4);
    for (let i = 0; i < N; i++) {
      q[i] += (dt / 6) * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i]);
      v[i] += (dt / 6) * (k1.a[i] + 2 * k2.a[i] + 2 * k3.a[i] + k4.a[i]);
    }
    return { pDiss: (k1.pDiss + 2 * k2.pDiss + 2 * k3.pDiss + k4.pDiss) / 6, pApplied: (k1.pApplied + 2 * k2.pApplied + 2 * k3.pApplied + k4.pApplied) / 6 };
  }

  private verlet(dt: number) {
    const { q, v } = this;
    const k1 = this.lastEval ?? this.evaluate(q, v);
    const vh = new Float64Array(v.length);
    for (let i = 0; i < q.length; i++) {
      q[i] += v[i] * dt + 0.5 * k1.a[i] * dt * dt;
      vh[i] = v[i] + k1.a[i] * dt;
    }
    const k2 = this.evaluate(q, vh);
    for (let i = 0; i < q.length; i++) v[i] += 0.5 * (k1.a[i] + k2.a[i]) * dt;
    return { pDiss: 0.5 * (k1.pDiss + k2.pDiss), pApplied: 0.5 * (k1.pApplied + k2.pApplied) };
  }

  private symplecticEuler(dt: number) {
    const { q, v } = this;
    const k1 = this.lastEval ?? this.evaluate(q, v);
    for (let i = 0; i < q.length; i++) {
      v[i] += k1.a[i] * dt;
      q[i] += v[i] * dt;
    }
    return { pDiss: k1.pDiss, pApplied: k1.pApplied };
  }

  private label(i: number) {
    return bodyName(this.scene.bodies[i]);
  }

  private emitted = new Set<string>();
  private emitOnce(kind: MechEventKind, body: number, message: string) {
    const key = `${kind}:${body}`;
    if (this.emitted.has(key)) return;
    this.emitted.add(key);
    this.events.push({ t: this.t, kind, body: this.scene.bodies[body].id, message });
  }

  private updateEngagement() {
    this.ropeOn = this.ropes.map((r) => r.L - this.ropeLength(r).len <= SLACK_TOL);
    this.linkOn = this.links.map((l) => l.rod || l.L - Math.hypot(l.pivot.x - this.q[2 * l.body], l.pivot.y - this.q[2 * l.body + 1]) <= SLACK_TOL);
  }

  /** Run `fix`, booking any change in KE+PE it causes as a geometric correction. */
  private corrected(fix: () => void) {
    const e0 = this.kinetic() + this.potential();
    fix();
    this.corrections += this.kinetic() + this.potential() - e0;
  }

  /** Advance one step. Returns a stop reason, or null to keep going. */
  step(dt: number): string | null {
    this.updateEngagement();
    // 1. contact lift-off check (a contact whose normal force would be negative)
    const ev0 = this.evaluate(this.q, this.v);
    for (let ci = this.contacts.length - 1; ci >= 0; ci--) {
      const inActive = ev0.rows.some((r) => r.kind === "contact" && r.ref === ci);
      if (!inActive) {
        const c = this.contacts[ci];
        this.contacts.splice(ci, 1);
        this.events.push({
          t: this.t,
          kind: "leave-surface",
          body: this.scene.bodies[c.body].id,
          message: `${this.label(c.body)} lifts off the ${this.scene.surfaces[c.surface].kind}`,
        });
      }
    }
    this.lastEval = null;
    this.decideFriction();
    this.lastEval = this.evaluate(this.q, this.v);
    const pStart = { d: this.lastEval.pDiss, a: this.lastEval.pApplied };

    const vy0 = Array.from({ length: this.n }, (_, i) => this.v[2 * i + 1]);
    const slideV0 = new Map(this.contacts.map((c) => [c, this.v[2 * c.body] * c.t.x + this.v[2 * c.body + 1] * c.t.y]));
    const integ = this.scene.integrator;
    const p = integ === "rk4" ? this.rk4(dt) : integ === "verlet" ? this.verlet(dt) : this.symplecticEuler(dt);
    void pStart;
    this.lastEval = null;
    this.t += dt;
    this.dissipated += p.pDiss * dt;
    this.appliedWork += p.pApplied * dt;

    // 2. sliding contacts that reversed: they stop (then static friction decides next step)
    for (const c of this.contacts) {
      if (c.mode !== "slide" || c.dir === 0 || c.muK === 0) continue;
      const i = c.body;
      const vt = this.v[2 * i] * c.t.x + this.v[2 * i + 1] * c.t.y;
      if (vt * c.dir < 0) {
        // velocity crossed zero inside the step: interpolate the stopping instant
        const vt0 = slideV0.get(c) ?? 0;
        const frac = Math.abs(vt0) / (Math.abs(vt0) + Math.abs(vt));
        this.corrected(() => {
          this.v[2 * i] -= vt * c.t.x;
          this.v[2 * i + 1] -= vt * c.t.y;
        });
        c.dir = 0;
        c.mode = "stick";
        if (Math.hypot(this.v[2 * i], this.v[2 * i + 1]) < 1e-6 && !this.restLogged[i]) {
          this.events.push({ t: this.t - dt + frac * dt, kind: "comes-to-rest", body: this.scene.bodies[i].id, message: `${this.label(i)} comes to rest` });
          this.restLogged[i] = true;
        }
      }
    }

    // 3. projections remove constraint drift; KE lost here is an inelastic jerk (tracked)
    this.ropeOn = [];
    this.linkOn = [];
    this.corrected(() => this.projectPositions());
    this.dissipated += this.projectVelocities();

    // 4. surface ends, collisions, rope state, events
    for (let ci = this.contacts.length - 1; ci >= 0; ci--) {
      const c = this.contacts[ci];
      const s = c.t.x * (this.q[2 * c.body] - c.p0.x) + c.t.y * (this.q[2 * c.body + 1] - c.p0.y);
      if (s < -1e-9 || s > c.len + 1e-9) {
        this.contacts.splice(ci, 1);
        this.events.push({
          t: this.t,
          kind: "slide-off-end",
          body: this.scene.bodies[c.body].id,
          message: `${this.label(c.body)} slides off the end of the ${this.scene.surfaces[c.surface].kind}`,
        });
      }
    }
    this.corrected(() => this.collideSurfaces());
    this.corrected(() => this.collideBodies());

    for (let i = 0; i < this.n; i++) {
      const free = !this.contacts.some((c) => c.body === i);
      if (free && vy0[i] > 0 && this.v[2 * i + 1] <= 0 && !this.links.some((l) => l.body === i) && !this.ropes.some((r) => r.a === i || r.b === i)) {
        this.events.push({
          t: this.t,
          kind: "max-height",
          body: this.scene.bodies[i].id,
          message: `${this.label(i)} reaches its maximum height, ${this.q[2 * i + 1].toFixed(2)} m`,
        });
      }
      const sp = Math.hypot(this.v[2 * i], this.v[2 * i + 1]);
      if (sp > 1e-3) this.everMoved[i] = true;
      if (sp >= 1e-3) this.restLogged[i] = false;
      if (this.everMoved[i] && this.wasMoving[i] && sp < 1e-4 && !free && !this.restLogged[i]) {
        this.restLogged[i] = true;
        this.events.push({ t: this.t, kind: "comes-to-rest", body: this.scene.bodies[i].id, message: `${this.label(i)} comes to rest` });
      }
      this.wasMoving[i] = sp >= 1e-4;
    }

    for (let ri = 0; ri < this.ropes.length; ri++) {
      const r = this.ropes[ri];
      const g = this.ropeLength(r);
      const taut = r.L - g.len <= 1e-6;
      if (taut !== this.ropeWasTaut[ri]) {
        this.events.push({ t: this.t, kind: taut ? "rope-taut" : "rope-slack", message: taut ? "The rope snaps taut" : "The rope goes slack" });
        this.ropeWasTaut[ri] = taut;
      }
      if (r.guides.length) {
        const pr = this.scene.pulleys[0]?.radius ?? 0.1;
        if (g.dA < this.h[r.a] + 0.25 * pr) return `${this.label(r.a)} reaches the pulley`;
        if (r.b >= 0 && g.dB < this.h[r.b] + 0.25 * pr) return `${this.label(r.b)} reaches the pulley`;
      }
    }
    for (let i = 0; i < 2 * this.n; i++) if (!Number.isFinite(this.q[i]) || !Number.isFinite(this.v[i])) return "numerical instability";
    for (let i = 0; i < this.n; i++) if (Math.abs(this.q[2 * i]) > 1e3 || Math.abs(this.q[2 * i + 1]) > 1e3) return `${this.label(i)} left the scene`;
    return null;
  }

  private collideSurfaces() {
    this.scene.bodies.forEach((b, i) => {
      if (!b.collides || this.contacts.some((c) => c.body === i)) return;
      const px = this.q[2 * i],
        py = this.q[2 * i + 1];
      const r = this.h[i];
      this.scene.surfaces.forEach((s, si) => {
        const ex = s.to.x - s.from.x,
          ey = s.to.y - s.from.y;
        const L2 = ex * ex + ey * ey;
        const u = Math.min(1, Math.max(0, ((px - s.from.x) * ex + (py - s.from.y) * ey) / L2));
        const cx = s.from.x + u * ex,
          cy = s.from.y + u * ey;
        const dx = px - cx,
          dy = py - cy;
        const d = Math.hypot(dx, dy);
        if (d >= r || d < 1e-12) return;
        const n = { x: dx / d, y: dy / d };
        const vn = this.v[2 * i] * n.x + this.v[2 * i + 1] * n.y;
        // time of first contact, interpolated back inside the step (sub-step accurate events)
        const tHit = vn < 0 ? Math.max(this.t - this.scene.dt, this.t - (r - d) / -vn) : this.t;
        // push out
        this.q[2 * i] += (r - d) * n.x;
        this.q[2 * i + 1] += (r - d) * n.y;
        if (vn >= 0) return;
        const keBefore = this.kinetic();
        const e = s.restitution;
        this.v[2 * i] += -(1 + e) * vn * n.x;
        this.v[2 * i + 1] += -(1 + e) * vn * n.y;
        const surfaceIsFloorLike = Math.abs(n.y) > 0.3 && u > 0 && u < 1;
        const slow = Math.abs(e * vn) < 0.25;
        if (surfaceIsFloorLike && slow) {
          this.attach(i, si, true);
          this.events.push({ t: tHit, kind: "land", body: b.id, message: `${bodyName(b)} lands on the ${s.kind} at x = ${this.q[2 * i].toFixed(2)} m` });
        } else {
          this.events.push({ t: tHit, kind: "bounce", body: b.id, message: `${bodyName(b)} hits the ${s.kind} at ${Math.abs(vn).toFixed(2)} m/s and bounces` });
        }
        {
          // KE lost in the impact is dissipation; cancel it from the correction ledger
          const lost = keBefore - this.kinetic();
          this.dissipated += lost;
          this.corrections += lost;
        }
      });
    });
  }

  private collideBodies() {
    const { scene } = this;
    const connected = (a: string, b: string) =>
      scene.ropes.some((r) => (r.bodyA === a && r.bodyB === b) || (r.bodyA === b && r.bodyB === a)) ||
      scene.springs.some((s) => (s.bodyA === a && s.bodyB === b) || (s.bodyA === b && s.bodyB === a));
    for (let i = 0; i < this.n; i++)
      for (let j = i + 1; j < this.n; j++) {
        const A = scene.bodies[i],
          B = scene.bodies[j];
        if (!A.collides || !B.collides || connected(A.id, B.id)) continue;
        const dx = this.q[2 * j] - this.q[2 * i],
          dy = this.q[2 * j + 1] - this.q[2 * i + 1];
        const d = Math.hypot(dx, dy);
        const R = this.h[i] + this.h[j];
        if (d >= R || d < 1e-12) continue;
        const n = { x: dx / d, y: dy / d };
        const rv = (this.v[2 * j] - this.v[2 * i]) * n.x + (this.v[2 * j + 1] - this.v[2 * i + 1]) * n.y;
        // separate proportionally to inverse mass
        const wi = 1 / this.m[i],
          wj = 1 / this.m[j];
        const corr = (R - d) / (wi + wj);
        this.q[2 * i] -= corr * wi * n.x;
        this.q[2 * i + 1] -= corr * wi * n.y;
        this.q[2 * j] += corr * wj * n.x;
        this.q[2 * j + 1] += corr * wj * n.y;
        if (rv >= 0) continue;
        const keBefore = this.kinetic();
        const J = (-(1 + this.bodyRestitution) * rv) / (wi + wj);
        this.v[2 * i] -= J * wi * n.x;
        this.v[2 * i + 1] -= J * wi * n.y;
        this.v[2 * j] += J * wj * n.x;
        this.v[2 * j + 1] += J * wj * n.y;
        {
          // KE lost in the impact is dissipation; cancel it from the correction ledger
          const lost = keBefore - this.kinetic();
          this.dissipated += lost;
          this.corrections += lost;
        }
        this.events.push({ t: this.t, kind: "collision", body: A.id, message: `${bodyName(A)} collides with ${bodyName(B)}` });
      }
  }

  /** Snapshot for the output stream. */
  frame(): MechFrame {
    const ev = this.evaluate(this.q, this.v);
    const ropeTension = this.ropes.map((_, ri) => {
      const k = ev.rows.findIndex((r) => r.kind === "rope" && r.ref === ri);
      return k >= 0 ? ev.lambda[k] : 0;
    });
    const linkTension = this.links.map((_, li) => {
      const k = ev.rows.findIndex((r) => r.kind === "link" && r.ref === li);
      return k >= 0 ? ev.lambda[k] : 0;
    });
    const idx = new Map(this.scene.bodies.map((b, i) => [b.id, i]));
    const springLength = this.scene.springs.map((s) => {
      const a = idx.get(s.bodyA)!;
      const pb = s.bodyB ? this.pos(idx.get(s.bodyB)!) : s.anchorB!;
      return Math.hypot(pb.x - this.q[2 * a], pb.y - this.q[2 * a + 1]);
    });
    const ke = this.kinetic(),
      pe = this.potential();
    return {
      t: this.t,
      bodies: this.scene.bodies.map((_, i) => ({
        x: this.q[2 * i],
        y: this.q[2 * i + 1],
        vx: this.v[2 * i],
        vy: this.v[2 * i + 1],
        ax: ev.a[2 * i],
        ay: ev.a[2 * i + 1],
      })),
      forces: ev.forces,
      ropeTension,
      ropeTaut: this.ropes.map((r) => r.L - this.ropeLength(r).len <= 1e-6),
      linkTension,
      springLength,
      contacts: this.contacts.map((c) => ({ body: c.body, surface: c.surface, mode: c.mode })),
      energy: {
        kinetic: ke,
        potential: pe,
        dissipated: this.dissipated,
        applied: this.appliedWork,
        corrections: this.corrections,
        residual: ke + pe + this.dissipated - this.appliedWork - this.corrections - this.E0,
      },
    };
  }
}

export interface RunOptions {
  duration: number;
  /** Output sample rate (Hz). */
  sampleRate?: number;
  dt?: number;
  integrator?: MechanicsScene["integrator"];
  bodyRestitution?: number;
}

/** Run a mechanics scene to completion and return sampled frames + events. */
export function simulateMechanics(scene: MechanicsScene, opts: RunOptions): MechResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const sc: MechanicsScene = { ...scene, integrator: opts.integrator ?? scene.integrator, dt: opts.dt ?? scene.dt };
  const sim = new MechanicsSim(sc, opts.bodyRestitution ?? 1);
  const dt = sc.dt;
  const sampleEvery = Math.max(1, Math.round(1 / ((opts.sampleRate ?? 60) * dt)));
  const frames: MechFrame[] = [sim.frame()];
  const steps = Math.ceil(opts.duration / dt - 1e-9);
  let stoppedEarly: string | undefined;
  let k = 0;
  for (; k < steps; k++) {
    const stop = sim.step(dt);
    if (stop) {
      stoppedEarly = stop;
      frames.push(sim.frame());
      sim.events.push({ t: sim.t, kind: "reach-pulley", message: `${stop} at t = ${sim.t.toFixed(2)} s — simulation ends` });
      break;
    }
    if ((k + 1) % sampleEvery === 0) frames.push(sim.frame());
  }
  let maxRes = 0,
    maxKE = 0,
    peRange = 0;
  const pe0 = frames[0].energy.potential;
  for (const f of frames) {
    maxRes = Math.max(maxRes, Math.abs(f.energy.residual));
    maxKE = Math.max(maxKE, f.energy.kinetic);
    peRange = Math.max(peRange, Math.abs(f.energy.potential - pe0));
  }
  const scale = Math.max(maxKE, peRange, 1e-9);
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    frames,
    events: sim.events,
    bodyIds: sc.bodies.map((b) => b.id),
    ropeGuides: sim.ropes.map((r) => r.guides),
    stoppedEarly,
    stats: {
      steps: k,
      dt,
      integrator: sc.integrator,
      maxEnergyResidualPct: (maxRes / scale) * 100,
      energyScale: scale,
      wallMs: t1 - t0,
    },
  };
}
