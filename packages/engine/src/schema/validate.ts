/**
 * Two-stage validation of untrusted scene JSON (from the AI, the builder, or a file):
 *   1. structural — Zod schema (types, ranges, required fields)
 *   2. semantic   — cross-references and physical sanity (rope points at a real body,
 *                   circuit has a ground node, params point at real numeric fields…)
 * The issues are human/LLM-readable so they can be fed back in the AI repair loop.
 */
import { Scene, type SceneInput } from "./scene";

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; scene: Scene; warnings: ValidationIssue[] } | { ok: false; issues: ValidationIssue[] };

export function validateScene(input: unknown): ValidationResult {
  const parsed = Scene.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const scene = parsed.data;
  const issues = semanticIssues(scene);
  const errors = issues.filter((i) => !i.message.startsWith("warning:"));
  if (errors.length) return { ok: false, issues: errors };
  return { ok: true, scene, warnings: issues.filter((i) => i.message.startsWith("warning:")) };
}

/** Parse a scene that we trust (examples); throws with a readable message. */
export function sceneFrom(input: SceneInput): Scene {
  const r = validateScene(input);
  if (!r.ok) throw new Error(`Invalid scene: ${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return r.scene;
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const d: string[] = [];
  for (const i of ids) {
    if (seen.has(i)) d.push(i);
    seen.add(i);
  }
  return d;
}

export function semanticIssues(scene: Scene): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const m = scene.mechanics;
  if (m) {
    const bodies = new Set(m.bodies.map((b) => b.id));
    const surfaces = new Set(m.surfaces.map((s) => s.id));
    const pulleys = new Set(m.pulleys.map((p) => p.id));
    const all = [...m.bodies, ...m.surfaces, ...m.pulleys, ...m.ropes, ...m.springs, ...m.links].map((x) => x.id);
    for (const d of dupes(all)) out.push({ path: "mechanics", message: `duplicate id "${d}"` });
    m.bodies.forEach((b, i) => {
      if (b.onSurface && !surfaces.has(b.onSurface)) out.push({ path: `mechanics.bodies.${i}.onSurface`, message: `unknown surface "${b.onSurface}"` });
    });
    m.surfaces.forEach((s, i) => {
      if (Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) < 1e-6) out.push({ path: `mechanics.surfaces.${i}`, message: "surface has zero length" });
      if (s.muKinetic > s.muStatic + 1e-12 && s.muStatic > 0)
        out.push({ path: `mechanics.surfaces.${i}`, message: "warning: muKinetic > muStatic is unusual" });
    });
    m.ropes.forEach((r, i) => {
      if (!bodies.has(r.bodyA)) out.push({ path: `mechanics.ropes.${i}.bodyA`, message: `unknown body "${r.bodyA}"` });
      if (r.bodyB && !bodies.has(r.bodyB)) out.push({ path: `mechanics.ropes.${i}.bodyB`, message: `unknown body "${r.bodyB}"` });
      if (!r.bodyB && !r.anchorB) out.push({ path: `mechanics.ropes.${i}`, message: "rope needs bodyB or anchorB" });
      if (r.bodyB && r.bodyB === r.bodyA) out.push({ path: `mechanics.ropes.${i}`, message: "rope connects a body to itself" });
      r.via.forEach((v, j) => {
        if (!pulleys.has(v.pulley)) out.push({ path: `mechanics.ropes.${i}.via.${j}`, message: `unknown pulley "${v.pulley}"` });
      });
    });
    m.springs.forEach((s, i) => {
      if (!bodies.has(s.bodyA)) out.push({ path: `mechanics.springs.${i}.bodyA`, message: `unknown body "${s.bodyA}"` });
      if (s.bodyB && !bodies.has(s.bodyB)) out.push({ path: `mechanics.springs.${i}.bodyB`, message: `unknown body "${s.bodyB}"` });
      if (!s.bodyB && !s.anchorB) out.push({ path: `mechanics.springs.${i}`, message: "spring needs bodyB or anchorB" });
    });
    m.links.forEach((l, i) => {
      if (!bodies.has(l.body)) out.push({ path: `mechanics.links.${i}.body`, message: `unknown body "${l.body}"` });
    });
  }
  const c = scene.circuit;
  if (c) {
    const nodes = new Set(c.nodes.map((n) => n.id));
    for (const d of dupes(c.nodes.map((n) => n.id))) out.push({ path: "circuit.nodes", message: `duplicate node "${d}"` });
    for (const d of dupes(c.components.map((n) => n.id))) out.push({ path: "circuit.components", message: `duplicate component "${d}"` });
    if (!nodes.has(c.ground)) out.push({ path: "circuit.ground", message: `ground "${c.ground}" is not a node` });
    c.components.forEach((k, i) => {
      if (!nodes.has(k.a)) out.push({ path: `circuit.components.${i}.a`, message: `unknown node "${k.a}"` });
      if (!nodes.has(k.b)) out.push({ path: `circuit.components.${i}.b`, message: `unknown node "${k.b}"` });
      if (k.a === k.b) out.push({ path: `circuit.components.${i}`, message: "component is shorted (a = b)" });
    });
    // every node must touch at least one component
    const touched = new Set(c.components.flatMap((k) => [k.a, k.b]));
    c.nodes.forEach((n, i) => {
      if (!touched.has(n.id)) out.push({ path: `circuit.nodes.${i}`, message: `warning: node "${n.id}" is not connected` });
    });
    if (c.acSweep) {
      if (!c.components.some((k) => k.id === c.acSweep!.source && k.type === "voltageSource"))
        out.push({ path: "circuit.acSweep.source", message: "acSweep.source must be a voltage source id" });
      if (!c.components.some((k) => k.id === c.acSweep!.probe)) out.push({ path: "circuit.acSweep.probe", message: "acSweep.probe must be a component id" });
    }
  }
  const o = scene.optics;
  if (o) {
    for (const d of dupes([...o.elements.map((e) => e.id), ...o.sources.map((s) => s.id)])) out.push({ path: "optics", message: `duplicate id "${d}"` });
  }
  scene.params.forEach((p, i) => {
    const v = getPath(scene, p.path);
    if (typeof v !== "number") out.push({ path: `params.${i}.path`, message: `"${p.path}" does not point at a number` });
    if (p.min >= p.max) out.push({ path: `params.${i}`, message: "min must be < max" });
  });
  return out;
}

/* ─────────── dotted-path helpers used by sliders, tutor actions and the builder ─────────── */

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Immutable set: returns a structurally-shared copy with `path` replaced by `value`. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const rec = (cur: unknown, i: number): unknown => {
    if (i === keys.length) return value;
    const k = keys[i];
    if (Array.isArray(cur)) {
      const copy = cur.slice();
      copy[Number(k)] = rec(cur[Number(k)], i + 1);
      return copy;
    }
    const base = (cur && typeof cur === "object" ? cur : {}) as Record<string, unknown>;
    return { ...base, [k]: rec(base[k], i + 1) };
  };
  return rec(obj, 0) as T;
}

export type { SceneInput };
