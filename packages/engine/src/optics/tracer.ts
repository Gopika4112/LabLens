/**
 * LabLens optics engine — a 2D geometric ray tracer, written from scratch.
 *
 * Geometry is a list of primitives (line segments and circular arcs), each owned by an
 * element and carrying a role: mirror, refracting boundary, ideal thin lens, or screen.
 * Each ray repeatedly finds its nearest intersection and then:
 *   mirror     d' = d − 2(d·n)n
 *   boundary   Snell's law in vector form; total internal reflection when
 *              1 − η²(1 − cos²θᵢ) < 0. The refractive indices on either side are found
 *              by point-in-medium tests just before/after the hit, so any shape works.
 *   thin lens  ideal-lens slope map  tanθ' = tanθ − h/f  (every ray from a point
 *              reaches the same image point — the definition of an ideal lens)
 *   screen     absorbs and records the hit
 * Transmitted intensity follows the unpolarised Fresnel equations.
 */
import type { OpticsScene, OpticalElement, LightSource } from "../schema/scene";
import { deg2rad } from "../math/numeric";

export interface P2 {
  x: number;
  y: number;
}

type Role = "mirror" | "boundary" | "thinLens" | "screen" | "absorber";

interface SegPrim {
  kind: "seg";
  a: P2;
  b: P2;
  role: Role;
  owner: string;
}
interface ArcPrim {
  kind: "arc";
  c: P2;
  r: number;
  /** accept a hit point on the circle? */
  accept: (p: P2) => boolean;
  role: Role;
  owner: string;
}
type Prim = SegPrim | ArcPrim;

interface Medium {
  owner: string;
  n: number;
  inside: (p: P2) => boolean;
}

export interface OpticsEvent {
  kind: "refraction" | "tir" | "reflection" | "lens" | "screen";
  owner: string;
  point: P2;
  n1?: number;
  n2?: number;
  /** angles from the surface normal, degrees */
  thetaIn?: number;
  thetaOut?: number;
  /** unit surface normal at the hit, pointing back toward the incoming ray */
  normal?: P2;
  rayIndex: number;
}

export interface RayPath {
  source: string;
  color: string;
  points: P2[];
  intensity: number[]; // per segment
  end: "escaped" | "absorbed" | "max-bounces";
}

export interface OpticsResult {
  rays: RayPath[];
  events: OpticsEvent[];
  stats: { rays: number; segments: number; maxSnellResidual: number; wallMs: number };
}

const EPS = 1e-9;
const dot = (a: P2, b: P2) => a.x * b.x + a.y * b.y;
const sub = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P2, b: P2): P2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P2, k: number): P2 => ({ x: a.x * k, y: a.y * k });
const norm = (a: P2): P2 => {
  const d = Math.hypot(a.x, a.y);
  return { x: a.x / d, y: a.y / d };
};
const dir = (deg: number): P2 => ({ x: Math.cos(deg2rad(deg)), y: Math.sin(deg2rad(deg)) });

function pointInPolygon(p: P2, vs: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const a = vs[i],
      b = vs[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Sag of a spherical surface with signed radius R and vertex at vx (axis along +x). */
function sag(vx: number, R: number, y: number): number {
  if (!Number.isFinite(R) || Math.abs(R) > 1e9) return vx;
  return vx + R - Math.sign(R) * Math.sqrt(Math.max(0, R * R - y * y));
}

/** Build primitives and media from scene elements. */
export function buildGeometry(scene: OpticsScene): { prims: Prim[]; media: Medium[]; lenses: Map<string, Extract<OpticalElement, { type: "thinLens" }>> } {
  const prims: Prim[] = [];
  const media: Medium[] = [];
  const lenses = new Map<string, Extract<OpticalElement, { type: "thinLens" }>>();
  for (const e of scene.elements) {
    switch (e.type) {
      case "thinLens": {
        const w = dir(e.axisAngle + 90);
        prims.push({ kind: "seg", a: add(e.position, mul(w, -e.height / 2)), b: add(e.position, mul(w, e.height / 2)), role: "thinLens", owner: e.id });
        lenses.set(e.id, e);
        break;
      }
      case "planeMirror":
        prims.push({ kind: "seg", a: e.from, b: e.to, role: "mirror", owner: e.id });
        break;
      case "screen":
        prims.push({ kind: "seg", a: e.from, b: e.to, role: "screen", owner: e.id });
        break;
      case "sphericalMirror": {
        const f = dir(e.facingAngle);
        const c = e.concave ? add(e.vertex, mul(f, e.radius)) : add(e.vertex, mul(f, -e.radius));
        const toVertex = norm(sub(e.vertex, c));
        const half = Math.asin(Math.min(1, e.height / 2 / e.radius));
        const cosHalf = Math.cos(half);
        prims.push({ kind: "arc", c, r: e.radius, accept: (p) => dot(norm(sub(p, c)), toVertex) >= cosHalf - 1e-12, role: "mirror", owner: e.id });
        break;
      }
      case "block": {
        const vs = e.vertices;
        for (let i = 0; i < vs.length; i++) prims.push({ kind: "seg", a: vs[i], b: vs[(i + 1) % vs.length], role: "boundary", owner: e.id });
        media.push({ owner: e.id, n: e.refractiveIndex, inside: (p) => pointInPolygon(p, vs) });
        break;
      }
      case "semicircle": {
        const nf = dir(e.flatNormalAngle);
        const t = { x: -nf.y, y: nf.x };
        const c = e.center;
        prims.push({ kind: "seg", a: add(c, mul(t, -e.radius)), b: add(c, mul(t, e.radius)), role: "boundary", owner: e.id });
        prims.push({ kind: "arc", c, r: e.radius, accept: (p) => dot(sub(p, c), nf) <= 1e-12, role: "boundary", owner: e.id });
        media.push({ owner: e.id, n: e.refractiveIndex, inside: (p) => Math.hypot(p.x - c.x, p.y - c.y) < e.radius && dot(sub(p, c), nf) < 0 });
        break;
      }
      case "sphericalLens": {
        const h = e.height / 2;
        const v1 = e.position.x - e.thickness / 2,
          v2 = e.position.x + e.thickness / 2;
        const y0 = e.position.y;
        const x1 = (y: number) => sag(v1, e.r1, y),
          x2 = (y: number) => sag(v2, e.r2, y);
        const hEdge = Math.min(h, Math.abs(e.r1) * 0.999, Math.abs(e.r2) * 0.999);
        const inside = (p: P2) => {
          const y = p.y - y0;
          return Math.abs(y) < hEdge && p.x > x1(y) && p.x < x2(y);
        };
        const surf = (vx: number, R: number) => {
          if (!Number.isFinite(R) || Math.abs(R) > 1e9) {
            prims.push({ kind: "seg", a: { x: vx, y: y0 - hEdge }, b: { x: vx, y: y0 + hEdge }, role: "boundary", owner: e.id });
            return;
          }
          const c = { x: vx + R, y: y0 };
          prims.push({
            kind: "arc",
            c,
            r: Math.abs(R),
            accept: (p) => Math.abs(p.y - y0) <= hEdge && Math.sign(p.x - c.x) === -Math.sign(R),
            role: "boundary",
            owner: e.id,
          });
        };
        surf(v1, e.r1);
        surf(v2, e.r2);
        // blackened rim closes the shape
        for (const s of [1, -1]) {
          const a = { x: x1(s * hEdge), y: y0 + s * hEdge },
            b = { x: x2(s * hEdge), y: y0 + s * hEdge };
          if (b.x > a.x) prims.push({ kind: "seg", a, b, role: "absorber", owner: e.id });
        }
        media.push({ owner: e.id, n: e.refractiveIndex, inside });
        break;
      }
    }
  }
  return { prims, media, lenses };
}

interface Hit {
  t: number;
  p: P2;
  n: P2; // unit normal (unoriented)
  prim: Prim;
}

function intersect(o: P2, d: P2, prim: Prim): Hit | null {
  if (prim.kind === "seg") {
    const e = sub(prim.b, prim.a);
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-15) return null;
    const w = sub(prim.a, o);
    const t = (w.x * e.y - w.y * e.x) / den;
    const u = (w.x * d.y - w.y * d.x) / den;
    if (t <= EPS || u < -1e-12 || u > 1 + 1e-12) return null;
    const L = Math.hypot(e.x, e.y);
    return { t, p: add(o, mul(d, t)), n: { x: -e.y / L, y: e.x / L }, prim };
  }
  const oc = sub(o, prim.c);
  const b = dot(oc, d);
  const cc = dot(oc, oc) - prim.r * prim.r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let best: Hit | null = null;
  for (const t of [-b - sq, -b + sq]) {
    if (t <= EPS) continue;
    const p = add(o, mul(d, t));
    if (!prim.accept(p)) continue;
    if (!best || t < best.t) best = { t, p, n: norm(sub(p, prim.c)), prim };
  }
  return best;
}

function indexAt(p: P2, media: Medium[], env: number): number {
  for (const m of media) if (m.inside(p)) return m.n;
  return env;
}

/** Fresnel transmittance for unpolarised light. */
function fresnelT(n1: number, n2: number, cosi: number, cost: number): number {
  const rs = (n1 * cosi - n2 * cost) / (n1 * cosi + n2 * cost);
  const rp = (n2 * cosi - n1 * cost) / (n2 * cosi + n1 * cost);
  return 1 - 0.5 * (rs * rs + rp * rp);
}

export function expandSources(sources: LightSource[]): { o: P2; d: P2; source: string; color: string }[] {
  const out: { o: P2; d: P2; source: string; color: string }[] = [];
  for (const s of sources) {
    if (s.type === "ray") out.push({ o: s.origin, d: dir(s.angle), source: s.id, color: s.color });
    else if (s.type === "beam") {
      const d = dir(s.angle);
      const w = { x: -d.y, y: d.x };
      for (let i = 0; i < s.count; i++) {
        const k = s.count === 1 ? 0 : i / (s.count - 1) - 0.5;
        out.push({ o: add(s.origin, mul(w, k * s.width)), d, source: s.id, color: s.color });
      }
    } else {
      for (let i = 0; i < s.count; i++) {
        const k = s.count === 1 ? 0 : i / (s.count - 1) - 0.5;
        out.push({ o: s.origin, d: dir(s.angle + k * s.spread), source: s.id, color: s.color });
      }
    }
  }
  return out;
}

export function traceRay(
  o0: P2,
  d0: P2,
  geo: ReturnType<typeof buildGeometry>,
  scene: OpticsScene,
  rayIndex: number,
  events: OpticsEvent[],
): { points: P2[]; intensity: number[]; end: RayPath["end"]; snellResidual: number } {
  let o = o0,
    d = norm(d0);
  const points: P2[] = [o];
  const intensity: number[] = [];
  let I = 1;
  let snellResidual = 0;
  const W = scene.worldSize;
  for (let bounce = 0; bounce <= scene.maxBounces; bounce++) {
    let hit: Hit | null = null;
    for (const prim of geo.prims) {
      const h = intersect(o, d, prim);
      if (h && (!hit || h.t < hit.t)) hit = h;
    }
    if (!hit) {
      // leave the world box
      const tx = d.x > 0 ? (W - o.x) / d.x : d.x < 0 ? (-W - o.x) / d.x : Infinity;
      const ty = d.y > 0 ? (W - o.y) / d.y : d.y < 0 ? (-W - o.y) / d.y : Infinity;
      const tExit = Math.max(0, Math.min(tx, ty));
      points.push(add(o, mul(d, tExit)));
      intensity.push(I);
      return { points, intensity, end: "escaped", snellResidual };
    }
    points.push(hit.p);
    intensity.push(I);
    const owner = hit.prim.owner;
    let n = hit.n;
    if (dot(n, d) > 0) n = mul(n, -1); // orient the normal against the incoming ray
    const cosi = -dot(d, n);
    switch (hit.prim.role) {
      case "screen":
        events.push({ kind: "screen", owner, point: hit.p, rayIndex });
        return { points, intensity, end: "absorbed", snellResidual };
      case "absorber":
        return { points, intensity, end: "absorbed", snellResidual };
      case "mirror":
        d = norm(add(d, mul(n, 2 * cosi)));
        events.push({ kind: "reflection", owner, point: hit.p, rayIndex });
        break;
      case "thinLens": {
        const lens = geo.lenses.get(owner)!;
        const u = dir(lens.axisAngle),
          w = dir(lens.axisAngle + 90);
        const du = dot(d, u),
          dw = dot(d, w);
        const s = Math.sign(du) || 1;
        const h = dot(sub(hit.p, lens.position), w);
        const slope = dw / Math.abs(du) - h / lens.focalLength;
        d = norm(add(mul(u, s), mul(w, slope)));
        events.push({ kind: "lens", owner, point: hit.p, rayIndex });
        break;
      }
      case "boundary": {
        const n1 = indexAt(sub(hit.p, mul(d, 1e-7)), geo.media, scene.environmentIndex);
        const n2 = indexAt(add(hit.p, mul(d, 1e-7)), geo.media, scene.environmentIndex);
        const eta = n1 / n2;
        const k = 1 - eta * eta * (1 - cosi * cosi);
        const thetaIn = (Math.acos(Math.min(1, cosi)) * 180) / Math.PI;
        if (k < 0) {
          d = norm(add(d, mul(n, 2 * cosi)));
          events.push({ kind: "tir", owner, point: hit.p, n1, n2, thetaIn, normal: n, rayIndex });
        } else {
          const cost = Math.sqrt(k);
          const dIn = d;
          d = norm(add(mul(d, eta), mul(n, eta * cosi - cost)));
          I *= fresnelT(n1, n2, cosi, cost);
          const thetaOut = (Math.acos(Math.min(1, -dot(d, n))) * 180) / Math.PI;
          // independent check of Snell's law from the resulting geometry (cross products)
          const sin1 = Math.abs(dIn.x * n.y - dIn.y * n.x);
          const sin2 = Math.abs(d.x * n.y - d.y * n.x);
          snellResidual = Math.max(snellResidual, Math.abs(n1 * sin1 - n2 * sin2));
          events.push({ kind: "refraction", owner, point: hit.p, n1, n2, thetaIn, thetaOut, normal: n, rayIndex });
        }
        break;
      }
    }
    o = hit.p;
  }
  return { points, intensity, end: "max-bounces", snellResidual };
}

export function traceOptics(scene: OpticsScene): OpticsResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const geo = buildGeometry(scene);
  const events: OpticsEvent[] = [];
  const rays: RayPath[] = [];
  let maxSnell = 0,
    segs = 0;
  expandSources(scene.sources).forEach((r, i) => {
    const res = traceRay(r.o, r.d, geo, scene, i, events);
    maxSnell = Math.max(maxSnell, res.snellResidual);
    segs += res.intensity.length;
    rays.push({ source: r.source, color: r.color, points: res.points, intensity: res.intensity, end: res.end });
  });
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { rays, events, stats: { rays: rays.length, segments: segs, maxSnellResidual: maxSnell, wallMs: t1 - t0 } };
}

/**
 * Least-squares "meeting point" of a bundle of rays (lines p + t·d):
 * minimises Σ distance² to each line. Used to locate images and focal points.
 */
export function leastSquaresMeet(lines: { p: P2; d: P2 }[]): P2 | null {
  let a11 = 0,
    a12 = 0,
    a22 = 0,
    b1 = 0,
    b2 = 0;
  for (const { p, d } of lines) {
    const u = norm(d);
    // projector onto the line's normal: I − u uᵀ
    const m11 = 1 - u.x * u.x,
      m12 = -u.x * u.y,
      m22 = 1 - u.y * u.y;
    a11 += m11;
    a12 += m12;
    a22 += m22;
    b1 += m11 * p.x + m12 * p.y;
    b2 += m12 * p.x + m22 * p.y;
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) return null;
  return { x: (a22 * b1 - a12 * b2) / det, y: (a11 * b2 - a12 * b1) / det };
}
