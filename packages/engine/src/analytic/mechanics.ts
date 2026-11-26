/**
 * Analytic layer for mechanics: recognise a textbook archetype from the Scene Graph
 * *structure*, derive the closed-form answer, and measure the same quantity from the
 * simulated trajectory. The two numbers are produced by completely independent code
 * paths — that is what makes the comparison meaningful.
 */
import type { MechanicsScene } from "../schema/scene";
import type { MechResult, MechFrame } from "../mechanics/engine";
import { ellipticK, linearFit, percentError, zeroCrossPeriod } from "../math/numeric";
import type { AuditCheck, CheckedQuantity, Verification } from "./types";

const q = (id: string, label: string, unit: string, analytic: number, simulated: number, formula: string): CheckedQuantity => ({
  id,
  label,
  unit,
  analytic,
  simulated,
  errorPct: percentError(simulated, analytic),
  formula,
});

/** Frames before any stop/collision, trimmed at the ends, for fitting. */
function cleanFrames(r: MechResult, until?: number): MechFrame[] {
  const end = until ?? (r.stoppedEarly ? r.frames[r.frames.length - 1].t : Infinity);
  const firstEvent = r.events.find((e) => ["bounce", "land", "collision", "slide-off-end", "leave-surface", "rope-slack"].includes(e.kind));
  const cutoff = Math.min(end, firstEvent ? firstEvent.t : Infinity);
  const fs = r.frames.filter((f) => f.t > 1e-9 && f.t < cutoff - 1e-9);
  return fs.length > 6 ? fs.slice(1, -1) : fs;
}

/** Fit acceleration along unit direction (ux,uy) for body i from velocity samples. */
function fitAccel(frames: MechFrame[], i: number, ux: number, uy: number): number {
  return linearFit(
    frames.map((f) => f.t),
    frames.map((f) => f.bodies[i].vx * ux + f.bodies[i].vy * uy),
  ).slope;
}

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);

export function energyAudit(r: MechResult): AuditCheck {
  const pct = r.stats.maxEnergyResidualPct;
  return {
    label: "Energy audit",
    value: pct,
    unit: "%",
    pass: pct < 0.5,
    detail: "max |KE + PE + dissipated − work in − E₀| over the run, as % of the energy in motion",
  };
}

function surfaceInfo(m: MechanicsScene, surfaceId: string) {
  const s = m.surfaces.find((x) => x.id === surfaceId)!;
  const tx = s.to.x - s.from.x,
    ty = s.to.y - s.from.y;
  const L = Math.hypot(tx, ty);
  const t = { x: tx / L, y: ty / L };
  const theta = Math.atan2(Math.abs(t.y), Math.abs(t.x)); // incline angle above horizontal
  return { s, t, theta };
}

export function analyzeMechanics(m: MechanicsScene, r: MechResult): Verification {
  const g = m.gravity;
  const audits = [energyAudit(r)];
  const notes: string[] = [];
  const noExtras = m.springs.length === 0 && m.links.length === 0;
  const B = m.bodies;
  const noDrag = B.every((b) => !b.dragLinear && !b.dragQuadratic && !b.appliedForce);
  const frames = cleanFrames(r);

  /* ── Atwood machine ── */
  if (B.length === 2 && m.ropes.length === 1 && m.ropes[0].bodyB && noExtras && noDrag && !B[0].onSurface && !B[1].onSurface && m.ropes[0].via.length >= 1) {
    const [m1, m2] = [B[0].mass, B[1].mass];
    const a = (Math.abs(m2 - m1) * g) / (m1 + m2);
    const T = (2 * m1 * m2 * g) / (m1 + m2);
    const heavier = m2 >= m1 ? 1 : 0;
    const aSim = frames.length > 2 ? Math.abs(fitAccel(frames, heavier, 0, -1)) : NaN;
    const TSim = mean(frames.map((f) => f.ropeTension[0]));
    return {
      archetype: "Atwood machine",
      summary: `Two masses (${m1} kg, ${m2} kg) hang over an ideal pulley.`,
      quantities: [
        q("a", "Acceleration of the system", "m/s²", a, aSim, "a = |m₂ − m₁|·g / (m₁ + m₂)"),
        q("T", "Rope tension", "N", T, TSim, "T = 2·m₁·m₂·g / (m₁ + m₂)"),
      ],
      audits,
      notes,
    };
  }

  /* ── Block on a surface connected over a pulley to a hanging mass (modified Atwood / incline) ── */
  if (B.length === 2 && m.ropes.length === 1 && m.ropes[0].bodyB && noExtras && noDrag && m.ropes[0].via.length >= 1) {
    const rope = m.ropes[0];
    const onIdx = B.findIndex((b) => b.onSurface);
    const hangIdx = 1 - onIdx;
    if (onIdx >= 0 && !B[hangIdx].onSurface && B.every((b) => b.velocity.x === 0 && b.velocity.y === 0)) {
      const A = B[onIdx],
        H = B[hangIdx];
      const { s, t, theta } = surfaceInfo(m, A.onSurface!);
      const pulley = m.pulleys.find((p) => p.id === rope.via[onIdx === 0 ? 0 : rope.via.length - 1].pulley)!;
      const toward = Math.sign(t.x * (pulley.position.x - A.position.x) + t.y * (pulley.position.y - A.position.y)) || 1;
      const sx = t.x * toward,
        sy = t.y * toward;
      const gAlong = -g * sy; // gravity component on A along s (toward the pulley)
      const N = A.mass * g * Math.cos(theta);
      const muS = Math.max(s.muStatic, s.muKinetic),
        muK = s.muKinetic;
      const M = A.mass + H.mass;
      const D = H.mass * g + A.mass * gAlong; // net driving force toward pulley without friction
      let a: number;
      if (D > muS * N) a = (D - muK * N) / M;
      else if (-D > muS * N) a = (D + muK * N) / M;
      else a = 0;
      const T = H.mass * (g - a);
      const aSim = frames.length > 2 ? fitAccel(frames, onIdx, sx, sy) : NaN;
      const TSim = mean(frames.map((f) => f.ropeTension[0]));
      const deg = ((theta * 180) / Math.PI).toFixed(0);
      const name = theta < 1e-6 ? "Table + pulley (modified Atwood)" : "Incline + pulley";
      if (a === 0) notes.push("Static friction is strong enough to hold the system at rest.");
      return {
        archetype: name,
        summary: `${A.mass} kg block on a ${deg}° surface (μk = ${muK}) tied over a pulley to a ${H.mass} kg hanging mass.`,
        quantities: [
          q("a", "Acceleration (toward pulley)", "m/s²", a, aSim, "a = (m₂g − m₁g·sinθ ∓ μk·m₁g·cosθ) / (m₁ + m₂)"),
          q("T", "Rope tension", "N", T, TSim, "T = m₂·(g − a)"),
        ],
        audits,
        notes,
      };
    }
  }

  /* ── Single block on a surface, released from rest or sliding to a stop ── */
  if (B.length === 1 && B[0].onSurface && m.ropes.length === 0 && noExtras && noDrag) {
    const A = B[0];
    const { s, t, theta } = surfaceInfo(m, A.onSurface!);
    const muS = Math.max(s.muStatic, s.muKinetic),
      muK = s.muKinetic;
    const v0 = A.velocity.x * t.x + A.velocity.y * t.y;
    if (theta < 1e-9 && Math.abs(v0) > 1e-9 && muK > 0) {
      const d = (v0 * v0) / (2 * muK * g);
      const last = r.frames[r.frames.length - 1];
      const dSim = Math.abs((last.bodies[0].x - r.frames[0].bodies[0].x) * t.x + (last.bodies[0].y - r.frames[0].bodies[0].y) * t.y);
      const stopT = r.events.find((e) => e.kind === "comes-to-rest")?.t ?? NaN;
      return {
        archetype: "Sliding to a stop",
        summary: `A ${A.mass} kg block slides at ${Math.abs(v0)} m/s on a surface with μk = ${muK}.`,
        quantities: [
          q("d", "Stopping distance", "m", d, dSim, "d = v₀² / (2·μk·g)"),
          q("t", "Stopping time", "s", Math.abs(v0) / (muK * g), stopT, "t = v₀ / (μk·g)"),
        ],
        audits,
        notes,
      };
    }
    if (Math.abs(v0) < 1e-12 && theta > 1e-9) {
      const slides = Math.tan(theta) > muS;
      const a = slides ? g * (Math.sin(theta) - muK * Math.cos(theta)) : 0;
      const down = t.y < 0 ? t : { x: -t.x, y: -t.y };
      const aSim = frames.length > 2 ? fitAccel(frames, 0, down.x, down.y) : NaN;
      if (!slides) notes.push(`tan θ = ${Math.tan(theta).toFixed(3)} ≤ μs = ${muS}: static friction holds the block.`);
      return {
        archetype: "Block on an incline",
        summary: `A ${A.mass} kg block released on a ${((theta * 180) / Math.PI).toFixed(0)}° incline (μs = ${muS}, μk = ${muK}).`,
        quantities: [q("a", "Acceleration down the incline", "m/s²", a, aSim, "a = g·(sinθ − μk·cosθ)  (0 if tanθ ≤ μs)")],
        audits,
        notes,
      };
    }
  }

  /* ── Simple pendulum ── */
  if (B.length === 1 && m.links.length === 1 && m.springs.length === 0 && m.ropes.length === 0 && noDrag && !B[0].onSurface) {
    const L0 = m.links[0];
    const bob = B[0];
    const L = L0.length ?? Math.hypot(bob.position.x - L0.pivot.x, bob.position.y - L0.pivot.y);
    const theta0 = Math.atan2(Math.abs(bob.position.x - L0.pivot.x), L0.pivot.y - bob.position.y);
    if (Math.hypot(bob.velocity.x, bob.velocity.y) < 1e-12 && theta0 > 0 && theta0 < Math.PI / 2 + 1e-9) {
      const T0 = 2 * Math.PI * Math.sqrt(L / g);
      const Texact = 4 * Math.sqrt(L / g) * ellipticK(Math.sin(theta0 / 2));
      const all = r.frames;
      const Tsim = zeroCrossPeriod(
        all.map((f) => f.t),
        all.map((f) => f.bodies[0].vx),
      );
      const Tmax = bob.mass * g * (3 - 2 * Math.cos(theta0));
      const TmaxSim = Math.max(...all.map((f) => f.linkTension[0]));
      notes.push(
        `Small-angle formula 2π√(L/g) = ${T0.toFixed(4)} s differs from the exact period by ${percentError(T0, Texact).toFixed(2)}% at θ₀ = ${((theta0 * 180) / Math.PI).toFixed(1)}°.`,
      );
      return {
        archetype: "Simple pendulum",
        summary: `A ${bob.mass} kg bob on a ${L.toFixed(2)} m string released from ${((theta0 * 180) / Math.PI).toFixed(1)}°.`,
        quantities: [
          q("T", "Period (exact, any amplitude)", "s", Texact, Tsim, "T = 4·√(L/g)·K(sin(θ₀/2))"),
          q("Tmax", "String tension at the bottom", "N", Tmax, TmaxSim, "T = m·g·(3 − 2cosθ₀)"),
        ],
        audits,
        notes,
      };
    }
  }

  /* ── Mass on a spring ── */
  if (B.length === 1 && m.springs.length === 1 && !m.springs[0].bodyB && m.links.length === 0 && m.ropes.length === 0 && noDrag) {
    const sp = m.springs[0];
    const bob = B[0];
    const k = sp.k,
      c = sp.damping,
      mass = bob.mass;
    const w0 = Math.sqrt(k / mass);
    const zeta = c / (2 * Math.sqrt(k * mass));
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const T = (2 * Math.PI) / wd;
      const all = r.frames;
      const dx = sp.anchorB!.x - bob.position.x,
        dy = sp.anchorB!.y - bob.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d,
        uy = dy / d;
      const Tsim = zeroCrossPeriod(
        all.map((f) => f.t),
        all.map((f) => f.bodies[0].vx * ux + f.bodies[0].vy * uy),
      );
      const quantities = [q("T", zeta > 0 ? "Damped period" : "Period", "s", T, Tsim, zeta > 0 ? "T = 2π / (ω₀√(1 − ζ²)),  ω₀ = √(k/m)" : "T = 2π·√(m/k)")];
      const vertical = Math.abs(uy) > 0.99 && !bob.onSurface;
      if (vertical && zeta > 0) {
        const eq = (mass * g) / k;
        // average stretch over the last full oscillation (between the last two velocity up-crossings)
        const tt = all.map((f) => f.t);
        const vel = all.map((f) => f.bodies[0].vx * ux + f.bodies[0].vy * uy);
        const ups: number[] = [];
        for (let i = 1; i < vel.length; i++) if (vel[i - 1] < 0 && vel[i] >= 0) ups.push(i);
        const i0 = ups.length >= 2 ? ups[ups.length - 2] : 0,
          i1 = ups.length >= 2 ? ups[ups.length - 1] : all.length - 1;
        let acc = 0;
        for (let i = i0 + 1; i <= i1; i++) {
          const s0 = Math.hypot(sp.anchorB!.x - all[i - 1].bodies[0].x, sp.anchorB!.y - all[i - 1].bodies[0].y);
          const s1 = Math.hypot(sp.anchorB!.x - all[i].bodies[0].x, sp.anchorB!.y - all[i].bodies[0].y);
          acc += 0.5 * (s0 + s1) * (tt[i] - tt[i - 1]);
        }
        const ext = acc / (tt[i1] - tt[i0]) - sp.restLength;
        quantities.push(q("x_eq", "Equilibrium stretch", "m", eq, ext, "x = m·g / k"));
      }
      return {
        archetype: zeta > 0 ? "Damped spring oscillator" : "Simple harmonic oscillator",
        summary: `A ${mass} kg mass on a spring with k = ${k} N/m${zeta > 0 ? ` and damping ζ = ${zeta.toFixed(3)}` : ""}.`,
        quantities,
        audits,
        notes,
      };
    }
  }

  /* ── 1-D collision of two bodies ── */
  if (
    B.length === 2 &&
    m.ropes.length === 0 &&
    noExtras &&
    noDrag &&
    B.every((b) => Math.abs(b.velocity.y) < 1e-12 && Math.abs(b.position.y - B[0].position.y) < 1e-9)
  ) {
    const flat = B.every((b) => !b.onSurface || surfaceInfo(m, b.onSurface).theta < 1e-9);
    const frictionless = B.every((b) => !b.onSurface || m.surfaces.find((s) => s.id === b.onSurface)!.muKinetic === 0);
    const hit = r.events.find((e) => e.kind === "collision");
    if (flat && frictionless && hit) {
      const [m1, m2] = [B[0].mass, B[1].mass];
      const [u1, u2] = [B[0].velocity.x, B[1].velocity.x];
      const e = 1;
      const v1 = (m1 * u1 + m2 * u2 + m2 * e * (u2 - u1)) / (m1 + m2);
      const v2 = (m1 * u1 + m2 * u2 + m1 * e * (u1 - u2)) / (m1 + m2);
      const last = r.frames[r.frames.length - 1];
      const p0 = m1 * u1 + m2 * u2;
      const p1 = m1 * last.bodies[0].vx + m2 * last.bodies[1].vx;
      audits.push({
        label: "Momentum conservation",
        value: percentError(p1, p0 || 1e-12),
        unit: "%",
        pass: Math.abs(p1 - p0) < 1e-9 * (Math.abs(p0) + 1),
        detail: "total momentum before vs after",
      });
      return {
        archetype: "Elastic collision (1-D)",
        summary: `${m1} kg at ${u1} m/s meets ${m2} kg at ${u2} m/s.`,
        quantities: [
          q("v1", `Final velocity of ${B[0].label ?? B[0].id}`, "m/s", v1, last.bodies[0].vx, "v₁' = ((m₁ − m₂)u₁ + 2m₂u₂) / (m₁ + m₂)"),
          q("v2", `Final velocity of ${B[1].label ?? B[1].id}`, "m/s", v2, last.bodies[1].vx, "v₂' = ((m₂ − m₁)u₂ + 2m₁u₁) / (m₁ + m₂)"),
        ],
        audits,
        notes,
      };
    }
  }

  /* ── Free flight: projectile / free fall / terminal velocity ── */
  if (B.length === 1 && !B[0].onSurface && m.ropes.length === 0 && noExtras && !B[0].appliedForce) {
    const b = B[0];
    if (b.dragQuadratic > 0 || b.dragLinear > 0) {
      const vt =
        b.dragQuadratic > 0 && !b.dragLinear
          ? Math.sqrt((b.mass * g) / b.dragQuadratic)
          : b.dragLinear > 0 && !b.dragQuadratic
            ? (b.mass * g) / b.dragLinear
            : NaN;
      if (Number.isFinite(vt)) {
        const fr = cleanFrames(r);
        const last = fr[fr.length - 1] ?? r.frames[r.frames.length - 1];
        const vSim = Math.hypot(last.bodies[0].vx, last.bodies[0].vy);
        notes.push("Terminal speed is approached asymptotically; the simulated value is the speed at the end of the run (or just before landing).");
        return {
          archetype: "Falling with air resistance",
          summary: `A ${b.mass} kg object falling with ${b.dragQuadratic ? `quadratic drag c = ${b.dragQuadratic} kg/m` : `linear drag b = ${b.dragLinear} kg/s`}.`,
          quantities: [q("vt", "Terminal speed", "m/s", vt, vSim, b.dragQuadratic ? "v_t = √(m·g / c)" : "v_t = m·g / b")],
          audits,
          notes,
        };
      }
    }
    const vx = b.velocity.x,
      vy = b.velocity.y;
    const y0 = b.position.y;
    const quantities: CheckedQuantity[] = [];
    if (frames.length > 2) quantities.push(q("ay", "Vertical acceleration", "m/s²", -g, fitAccel(frames, 0, 0, 1), "a_y = −g"));
    if (vy > 0) {
      const H = y0 + (vy * vy) / (2 * g);
      // refine the sampled peak with a parabola through the three highest samples
      const ys = r.frames.map((f) => f.bodies[0].y);
      let k = 1;
      for (let i = 1; i < ys.length - 1; i++) if (ys[i] > ys[k]) k = i;
      const [ya, yb, yc] = [ys[k - 1], ys[k], ys[k + 1]];
      const denom = ya - 2 * yb + yc;
      const Hs = denom !== 0 ? yb - ((ya - yc) * (ya - yc)) / (8 * denom) : yb;
      quantities.push(q("H", "Maximum height", "m", H, Hs, "H = y₀ + v_y² / (2g)"));
    }
    // the landing surface is the lowest horizontal surface below the launch point
    const floor = m.surfaces.filter((s) => Math.abs(s.from.y - s.to.y) < 1e-9 && s.from.y < y0 - b.size / 2 - 1e-9).sort((p, q) => p.from.y - q.from.y)[0];
    const land = r.events.find((e) => e.kind === "bounce" || e.kind === "land");
    if (floor && land) {
      const yHit = floor.from.y + b.size / 2;
      const tf = (vy + Math.sqrt(vy * vy + 2 * g * (y0 - yHit))) / g;
      quantities.push(q("tf", "Time of flight", "s", tf, land.t, "t = (v_y + √(v_y² + 2g·Δy)) / g"));
      if (Math.abs(vx) > 1e-9) {
        // horizontal position at the landing time, interpolated from frames
        const fi = r.frames.findIndex((f) => f.t >= land.t);
        const f1 = r.frames[Math.max(1, fi) - 1];
        const xs = b.position.x + vx * land.t; // x is unaffected by gravity until impact
        void f1;
        const rangeSim = (() => {
          // first frame at/after impact still has pre-impact x velocity (bounce reflects only normal velocity)
          const a = r.frames[Math.max(0, fi - 1)],
            c = r.frames[fi] ?? a;
          const w = c.t === a.t ? 0 : (land.t - a.t) / (c.t - a.t);
          return a.bodies[0].x + w * (c.bodies[0].x - a.bodies[0].x) - b.position.x;
        })();
        void xs;
        quantities.push(q("R", "Horizontal range", "m", vx * tf, rangeSim, "R = v_x · t"));
      }
    }
    // lead with what the problem usually asks: range, then height, then time
    const order = ["R", "H", "tf", "ay"];
    quantities.sort((p, q) => order.indexOf(p.id) - order.indexOf(q.id));
    if (quantities.length)
      return {
        archetype: vx === 0 && vy === 0 ? "Free fall" : "Projectile motion",
        summary: `A ${b.mass} kg object launched at (${vx.toFixed(2)}, ${vy.toFixed(2)}) m/s from y = ${y0} m, no air resistance.`,
        quantities,
        audits,
        notes,
      };
  }

  return {
    archetype: null,
    summary: "No single textbook formula covers this scene — verified by the energy audit instead.",
    quantities: [],
    audits,
    notes,
  };
}
