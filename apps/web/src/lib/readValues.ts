import { TEMPLATES } from "@lablens/engine";

/**
 * Turn an AI template reply's args into "read from the problem" chips, leaving out any arg that one of
 * the model's own assumption/uncertain notes is about. A note's subject is the first arg it names, by
 * id ("muS") or label ("static friction"): in "μs not given; assumed equal to μk = 0.2" only μs was
 * assumed, and μk was read.
 */
export function readValues(template: string, args: Record<string, number>, notes: string[]): string[] {
  const docs = TEMPLATES[template]?.argDocs ?? {};
  const norm = (s: string) => s.toLowerCase().replace(/μ/g, "mu");
  const keys = Object.keys(args);
  const assumed = new Set<string>();
  for (const note of notes.map(norm)) {
    let best: { k: string; at: number } | null = null;
    for (const k of keys) {
      const label = docs[k]?.[0] ? norm(docs[k][0]).replace(/ coefficient$/, "") : null;
      const id = new RegExp(`(^|[^a-z0-9])${norm(k)}(?![a-z0-9])`).exec(note);
      const positions = [id ? id.index + id[1].length : -1, label ? note.indexOf(label) : -1].filter((p) => p >= 0);
      const at = positions.length ? Math.min(...positions) : -1;
      if (at >= 0 && (!best || at < best.at)) best = { k, at };
    }
    if (best) assumed.add(best.k);
  }
  return keys.filter((k) => !assumed.has(k)).map((k) => `${docs[k]?.[0] ?? k} = ${+args[k].toPrecision(4)} ${docs[k]?.[1] ?? ""}`.trim());
}
