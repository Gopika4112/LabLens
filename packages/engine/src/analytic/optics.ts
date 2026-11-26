/** Analytic layer for optics: thin-lens equation, mirror focus, Snell, critical angle, lensmaker. */
import type { OpticsScene, OpticalElement } from "../schema/scene";
import { buildGeometry, traceRay, leastSquaresMeet, type OpticsResult, type P2, type OpticsEvent } from "../optics/tracer";
import { deg2rad, percentError, polyFit, rad2deg } from "../math/numeric";
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

type El<T extends OpticalElement["type"]> = Extract<OpticalElement, { type: T }>;

export function opticsAudits(r: OpticsResult): AuditCheck[] {
  return [
    {
      label: "Snell's law residual",
      value: r.stats.maxSnellResidual,
      unit: "",
      pass: r.stats.maxSnellResidual < 1e-9,
      detail: "max |n₁·sinθ₁ − n₂·sinθ₂| over every refraction, from the traced vectors",
    },
  ];
}

/** Outgoing line of ray `i` right after its event at `owner`. */
function outgoingAfter(r: OpticsResult, owner: string, kind: OpticsEvent["kind"]): { p: P2; d: P2; h: P2 }[] {
  const lines: { p: P2; d: P2; h: P2 }[] = [];
  r.rays.forEach((ray) => {
    // find the point in the path that coincides with the event of this ray at this owner
    for (let k = 1; k < ray.points.length - 1; k++) {
      const p = ray.points[k];
      const ev = r.events.find((e) => e.owner === owner && e.kind === kind && Math.hypot(e.point.x - p.x, e.point.y - p.y) < 1e-9);
      if (ev) {
        const nx = ray.points[k + 1];
        lines.push({ p, d: { x: nx.x - p.x, y: nx.y - p.y }, h: p });
        break;
      }
    }
  });
  return lines;
}

export function analyzeOptics(o: OpticsScene, r: OpticsResult): Verification {
  const audits = opticsAudits(r);
  const notes: string[] = [];
  const els = o.elements.filter((e) => e.type !== "screen");
  const one = els.length === 1 ? els[0] : null;

  /* ── Thin lens forming an image of a point source ── */
  if (one?.type === "thinLens" && o.sources.length === 1 && o.sources[0].type === "point") {
    const L = one as El<"thinLens">;
    const s = o.sources[0];
    const u = { x: Math.cos(deg2rad(L.axisAngle)), y: Math.sin(deg2rad(L.axisAngle)) };
    const w = { x: -u.y, y: u.x };
    const rel = { x: L.position.x - s.origin.x, y: L.position.y - s.origin.y };
    const dObj = rel.x * u.x + rel.y * u.y;
    const hObj = -(rel.x * w.x + rel.y * w.y);
    const f = L.focalLength;
    if (dObj > 0 && Math.abs(dObj - f) > 1e-9) {
      const di = (f * dObj) / (dObj - f);
      const m = -di / dObj;
      const lines = outgoingAfter(r, L.id, "lens");
      const meet = lines.length >= 2 ? leastSquaresMeet(lines) : null;
      const diSim = meet ? (meet.x - L.position.x) * u.x + (meet.y - L.position.y) * u.y : NaN;
      const hiSim = meet ? (meet.x - L.position.x) * w.x + (meet.y - L.position.y) * w.y : NaN;
      const quantities = [q("di", "Image distance", "m", di, diSim, "1/f = 1/d_o + 1/d_i")];
      if (Math.abs(hObj) > 1e-9) quantities.push(q("m", "Magnification", "×", m, hiSim / hObj, "m = −d_i / d_o"));
      notes.push(
        di > 0
          ? "Real image: the rays really meet on the far side of the lens."
          : "Virtual image: the outgoing rays diverge; they only appear to come from the image point.",
      );
      return {
        archetype: f > 0 ? "Converging lens" : "Diverging lens",
        summary: `Object ${dObj.toFixed(2)} m from a lens with f = ${f} m.`,
        quantities,
        audits,
        notes,
      };
    }
  }

  /* ── Spherical mirror focusing a parallel beam ── */
  if (one?.type === "sphericalMirror" && o.sources.length === 1 && o.sources[0].type === "beam") {
    const M = one as El<"sphericalMirror">;
    const fa = { x: Math.cos(deg2rad(M.facingAngle)), y: Math.sin(deg2rad(M.facingAngle)) };
    // Where each reflected ray crosses the axis, as a function of its height h; the paraxial
    // focus is the h → 0 limit of a fit x(h) = a + b·h² + c·h⁴ (spherical aberration is even in h).
    const lines = outgoingAfter(r, M.id, "reflection");
    const ax = { x: -fa.y, y: fa.x }; // transverse direction
    const hs: number[] = [],
      xs: number[] = [];
    for (const l of lines) {
      const h = (l.p.x - M.vertex.x) * ax.x + (l.p.y - M.vertex.y) * ax.y;
      const dh = l.d.x * ax.x + l.d.y * ax.y;
      if (Math.abs(h) < 1e-9 || Math.abs(dh) < 1e-15) continue;
      const tt = -h / dh;
      const px = l.p.x + l.d.x * tt,
        py = l.p.y + l.d.y * tt;
      hs.push(h * h);
      xs.push((px - M.vertex.x) * fa.x + (py - M.vertex.y) * fa.y);
    }
    const fSim = hs.length >= 3 ? polyFit(hs, xs, 2)[0] : NaN;
    const f = M.concave ? M.radius / 2 : -M.radius / 2;
    notes.push("f = R/2 is the paraxial (narrow-beam) result; wider beams focus slightly closer to the mirror — spherical aberration.");
    return {
      archetype: M.concave ? "Concave mirror" : "Convex mirror",
      summary: `A ${M.concave ? "concave" : "convex"} mirror of radius ${M.radius} m.`,
      quantities: [q("f", "Focal length", "m", f, fSim, "f = R / 2")],
      audits,
      notes,
    };
  }

  /* ── Refraction through a block (Snell + lateral shift for a slab) ── */
  if (one?.type === "block" && o.sources.length === 1 && o.sources[0].type === "ray") {
    const B = one as El<"block">;
    const evs = r.events.filter((e) => e.kind === "refraction" && e.rayIndex === 0);
    const tir = r.events.find((e) => e.kind === "tir" && e.rayIndex === 0);
    if (evs.length >= 1) {
      const e1 = evs[0];
      const th2 = rad2deg(Math.asin((e1.n1! * Math.sin(deg2rad(e1.thetaIn!))) / e1.n2!));
      const quantities = [q("theta2", "Angle of refraction", "°", th2, e1.thetaOut!, "n₁·sinθ₁ = n₂·sinθ₂")];
      if (B.vertices.length === 4 && evs.length >= 2 && !tir) {
        // parallel-sided slab: exit ray is parallel to the incident ray, shifted sideways
        const ray = r.rays[0];
        const pIn = ray.points[0],
          pHit = ray.points[1];
        const dIn = { x: pHit.x - pIn.x, y: pHit.y - pIn.y };
        const LdIn = Math.hypot(dIn.x, dIn.y);
        const pOut = ray.points[2];
        const shiftSim = Math.abs((dIn.x * (pOut.y - pHit.y) - dIn.y * (pOut.x - pHit.x)) / LdIn);
        const th1 = deg2rad(e1.thetaIn!),
          t2 = deg2rad(th2);
        const thickness = Math.hypot(pOut.x - pHit.x, pOut.y - pHit.y) * Math.cos(t2);
        quantities.push(q("shift", "Sideways shift of the beam", "m", (thickness * Math.sin(th1 - t2)) / Math.cos(t2), shiftSim, "d = t·sin(θ₁ − θ₂) / cosθ₂"));
      }
      return {
        archetype: "Refraction (Snell's law)",
        summary: `A ray enters a medium with n = ${B.refractiveIndex} at ${e1.thetaIn!.toFixed(1)}° to the normal.`,
        quantities,
        audits,
        notes,
      };
    }
  }

  /* ── Total internal reflection in a semicircular block ── */
  if (one?.type === "semicircle") {
    const S = one as El<"semicircle">;
    const thc = rad2deg(Math.asin(o.environmentIndex / S.refractiveIndex));
    // Measure: aim rays through the curved face at the centre; bisect the incidence angle
    // at which the traced ray first undergoes TIR at the flat face.
    const geo = buildGeometry({ ...o, sources: o.sources });
    const nf = { x: Math.cos(deg2rad(S.flatNormalAngle)), y: Math.sin(deg2rad(S.flatNormalAngle)) };
    const tirAt = (deg: number) => {
      // incoming from inside: direction makes `deg` with the flat-face normal
      const a = deg2rad(deg);
      const t = { x: -nf.y, y: nf.x };
      const d = { x: nf.x * Math.cos(a) + t.x * Math.sin(a), y: nf.y * Math.cos(a) + t.y * Math.sin(a) };
      const start = { x: S.center.x - d.x * S.radius * 1.5, y: S.center.y - d.y * S.radius * 1.5 };
      const evs: OpticsEvent[] = [];
      traceRay(start, d, geo, o, 0, evs);
      return evs.some((e) => e.kind === "tir" && e.owner === S.id);
    };
    let lo = 0,
      hi = 89.999;
    if (!tirAt(lo) && tirAt(hi)) {
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (tirAt(mid)) hi = mid;
        else lo = mid;
      }
    }
    return {
      archetype: "Total internal reflection",
      summary: `Light inside glass (n = ${S.refractiveIndex}) meeting the flat face.`,
      quantities: [q("thc", "Critical angle", "°", thc, (lo + hi) / 2, "sinθc = n₂ / n₁")],
      audits,
      notes: ["Measured by bisection: the tracer is asked, angle by angle, whether a ray totally reflects."],
    };
  }

  /* ── Thick spherical lens: lensmaker / back focal distance ── */
  if (one?.type === "sphericalLens" && o.sources.length === 1 && o.sources[0].type === "beam") {
    const Lz = one as El<"sphericalLens">;
    const n = Lz.refractiveIndex / o.environmentIndex;
    const { r1: R1, r2: R2, thickness: d } = Lz;
    const P = (n - 1) * (1 / R1 - 1 / R2 + ((n - 1) * d) / (n * R1 * R2));
    const f = 1 / P;
    const bfd = f * (1 - ((n - 1) * d) / (n * R1));
    // measured: where each outgoing ray crosses the axis, extrapolated to h → 0 (x = a + b·h² + c·h⁴)
    const back = Lz.position.x + Lz.thickness / 2;
    const y0 = Lz.position.y;
    const hs: number[] = [],
      xs: number[] = [];
    r.rays.forEach((ray) => {
      const h = ray.points[0].y - y0;
      const k = ray.points.length - 2;
      if (Math.abs(h) < 1e-9 || k < 1) return;
      const a = ray.points[k],
        b = ray.points[k + 1];
      if (Math.abs(b.y - a.y) < 1e-12) return;
      const x = a.x + ((y0 - a.y) * (b.x - a.x)) / (b.y - a.y);
      hs.push(h * h);
      xs.push(x - back);
    });
    const fit = { intercept: hs.length >= 3 ? polyFit(hs, xs, 2)[0] : NaN };
    notes.push("Measured by tracing real refraction at both curved surfaces, then extrapolating the axis crossings to the paraxial limit (h → 0).");
    return {
      archetype: "Thick lens (lensmaker's equation)",
      summary: `Glass lens n = ${Lz.refractiveIndex}, R₁ = ${R1} m, R₂ = ${R2} m, thickness ${d} m.`,
      quantities: [
        q("bfd", "Back focal distance", "m", bfd, fit.intercept, "BFD = f·(1 − (n−1)·d / (n·R₁))"),
        q("f", "Effective focal length", "m", f, NaN, "1/f = (n−1)·[1/R₁ − 1/R₂ + (n−1)d/(n·R₁R₂)]"),
      ].filter((x) => Number.isFinite(x.simulated)),
      audits,
      notes,
    };
  }

  return { archetype: null, summary: "An optical system — every refraction is checked against Snell's law.", quantities: [], audits, notes };
}
