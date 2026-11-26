/** Applying slider / tutor parameter changes to a scene. */
import type { Scene } from "./schema/scene";
import { setPath, validateScene } from "./schema/validate";
import { buildTemplate } from "./templates";

export function paramValue(scene: Scene, paramId: string): number | undefined {
  const p = scene.params.find((q) => q.id === paramId);
  if (!p) return undefined;
  const keys = p.path.split(".");
  let cur: unknown = scene;
  for (const k of keys) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined;
  return typeof cur === "number" ? cur : undefined;
}

/**
 * Set a parameter (clamped to its slider range). Template params rebuild the scene from
 * its template so dependent geometry stays consistent; plain params patch one field.
 */
export function applyParam(scene: Scene, paramId: string, value: number): Scene {
  const p = scene.params.find((q) => q.id === paramId);
  if (!p) throw new Error(`unknown parameter "${paramId}"`);
  const v = Math.min(p.max, Math.max(p.min, value));
  if (p.path.startsWith("template.args.") && scene.template) {
    const key = p.path.slice("template.args.".length);
    const rebuilt = buildTemplate(scene.template.name, { ...scene.template.args, [key]: v });
    const r = validateScene({ ...rebuilt, id: scene.id, title: scene.title, problemText: scene.problemText, question: scene.question ?? rebuilt.question });
    if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("; "));
    return r.scene;
  }
  const next = setPath(scene, p.path, v);
  const r = validateScene(next);
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("; "));
  return r.scene;
}
