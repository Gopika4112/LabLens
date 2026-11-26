import { useMemo, useRef, useState } from "react";
import { EXAMPLES, exampleScene, getPath, setPath, validateScene, type Scene, type SceneInput, type ValidationIssue } from "@lablens/engine";
import { cssVar, useCanvas, type Camera } from "../lib/useCanvas";
import { drawMechanics } from "../components/render/mechanics";
import { drawCircuit } from "../components/render/circuits";
import { drawOptics } from "../components/render/optics";
import { getScene, setScene } from "../lib/sceneStore";
import { go } from "../lib/router";
import { traceOptics } from "@lablens/engine";
import { Icon } from "../components/Icon";

type Draft = Record<string, unknown>;

/** Every {x, y} point in the active domain is a drag handle. */
function handles(d: Draft): { path: string; x: number; y: number }[] {
  const out: { path: string; x: number; y: number }[] = [];
  const domainKey = d.domain === "circuits" ? "circuit" : (d.domain as string);
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.x === "number" && typeof o.y === "number" && !path.endsWith("velocity") && !path.endsWith("appliedForce"))
        out.push({ path, x: o.x, y: o.y });
      else for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`);
    }
  };
  walk(d[domainKey], domainKey);
  return out;
}

/** Sliders for a hand-built scene: the main numeric property of each item. */
function autoParams(s: Draft): SceneInput["params"] {
  const out: NonNullable<SceneInput["params"]> = [];
  const add = (id: string, label: string, path: string, min: number, max: number, step: number, unit: string) => {
    const v = getPath(s, path);
    if (typeof v === "number" && out.length < 16) out.push({ id, label, path, min: Math.min(min, v), max: Math.max(max, v), step, unit });
  };
  const m = s.mechanics as { bodies?: { id: string; label?: string }[]; surfaces?: { id: string }[]; springs?: { id: string }[] } | undefined;
  m?.bodies?.forEach((b, i) => add(`mass_${b.id}`, `${b.label ?? b.id} mass`, `mechanics.bodies.${i}.mass`, 0.1, 20, 0.1, "kg"));
  m?.surfaces?.forEach((x, i) => add(`mu_${x.id}`, `${x.id} friction μk`, `mechanics.surfaces.${i}.muKinetic`, 0, 1, 0.01, ""));
  m?.springs?.forEach((x, i) => add(`k_${x.id}`, `${x.id} stiffness`, `mechanics.springs.${i}.k`, 1, 500, 1, "N/m"));
  const c = s.circuit as { components?: { id: string; type: string; label?: string }[] } | undefined;
  c?.components?.forEach((k, i) => {
    const key = {
      resistor: "resistance",
      lamp: "resistance",
      capacitor: "capacitance",
      inductor: "inductance",
      voltageSource: "voltage",
      currentSource: "current",
    }[k.type];
    const unit = { resistor: "Ω", lamp: "Ω", capacitor: "F", inductor: "H", voltageSource: "V", currentSource: "A" }[k.type] ?? "";
    if (key) {
      const v = getPath(s, `circuit.components.${i}.${key}`) as number;
      add(`${key}_${k.id}`, `${k.label ?? k.id}`, `circuit.components.${i}.${key}`, v / 10, v * 10, v / 100, unit);
    }
  });
  const o = s.optics as { elements?: { id: string; type: string }[]; sources?: { id: string }[] } | undefined;
  o?.elements?.forEach((e, i) => {
    if (e.type === "thinLens") add(`f_${e.id}`, `${e.id} focal length`, `optics.elements.${i}.focalLength`, -3, 3, 0.05, "m");
    if ("refractiveIndex" in e) add(`n_${e.id}`, `${e.id} index n`, `optics.elements.${i}.refractiveIndex`, 1, 2.5, 0.01, "");
  });
  o?.sources?.forEach((x, i) => add(`ang_${x.id}`, `${x.id} angle`, `optics.sources.${i}.angle`, -90, 90, 0.5, "°"));
  return out;
}

const uid = (p: string, d: Draft) => {
  const s = JSON.stringify(d);
  let i = 1;
  while (s.includes(`"${p}${i}"`)) i++;
  return `${p}${i}`;
};

const PALETTE: Record<string, { label: string; add: (d: Draft) => Draft }[]> = {
  mechanics: [
    { label: "Block", add: (d) => push(d, "mechanics.bodies", { id: uid("block", d), mass: 2, position: { x: 0, y: 1 } }) },
    { label: "Ball", add: (d) => push(d, "mechanics.bodies", { id: uid("ball", d), mass: 0.5, shape: "ball", size: 0.25, position: { x: 1, y: 2 } }) },
    {
      label: "Floor",
      add: (d) =>
        push(d, "mechanics.surfaces", { id: uid("floor", d), kind: "floor", from: { x: -3, y: 0 }, to: { x: 3, y: 0 }, muStatic: 0.3, muKinetic: 0.2 }),
    },
    {
      label: "Incline",
      add: (d) =>
        push(d, "mechanics.surfaces", { id: uid("ramp", d), kind: "incline", from: { x: -2, y: 0 }, to: { x: 1, y: 1.7 }, muStatic: 0.2, muKinetic: 0.15 }),
    },
    { label: "Pulley", add: (d) => push(d, "mechanics.pulleys", { id: uid("pulley", d), position: { x: 0, y: 3 }, radius: 0.25 }) },
    {
      label: "Rope (first 2 bodies over first pulley)",
      add: (d) => {
        const m = d.mechanics as { bodies: { id: string }[]; pulleys: { id: string }[] };
        if (m.bodies.length < 2) return d;
        return push(d, "mechanics.ropes", {
          id: uid("rope", d),
          bodyA: m.bodies[0].id,
          bodyB: m.bodies[1].id,
          via: m.pulleys[0]
            ? [
                { pulley: m.pulleys[0].id, side: "left" },
                { pulley: m.pulleys[0].id, side: "right" },
              ]
            : [],
        });
      },
    },
    {
      label: "Spring (first body → wall)",
      add: (d) =>
        push(d, "mechanics.springs", {
          id: uid("spring", d),
          bodyA: (d.mechanics as { bodies: { id: string }[] }).bodies[0].id,
          anchorB: { x: -2, y: 1 },
          k: 40,
          restLength: 1.5,
        }),
    },
    {
      label: "Pendulum string (first body)",
      add: (d) =>
        push(d, "mechanics.links", {
          id: uid("link", d),
          kind: "string",
          body: (d.mechanics as { bodies: { id: string }[] }).bodies[0].id,
          pivot: { x: 0, y: 3 },
        }),
    },
  ],
  circuits: [
    { label: "Node", add: (d) => push(d, "circuit.nodes", { id: uid("n", d), position: { x: 3, y: 3 } }) },
    ...(["resistor", "capacitor", "inductor", "lamp", "voltageSource", "switch"] as const).map((type) => ({
      label:
        { resistor: "Resistor", capacitor: "Capacitor", inductor: "Inductor", lamp: "Lamp", voltageSource: "Battery", switch: "Switch" }[type] +
        " (between last 2 nodes)",
      add: (d: Draft) => {
        const nodes = (d.circuit as { nodes: { id: string }[] }).nodes;
        const [a, b] = nodes.slice(-2);
        const extra = {
          resistor: { resistance: 100 },
          capacitor: { capacitance: 0.001 },
          inductor: { inductance: 1 },
          lamp: { resistance: 50 },
          voltageSource: { voltage: 6 },
          switch: { closeAt: 0.1 },
        }[type];
        return push(d, "circuit.components", { id: uid(type.slice(0, 3).toUpperCase(), d), type, a: a.id, b: b.id, ...extra });
      },
    })),
  ],
  optics: [
    {
      label: "Thin lens",
      add: (d) => push(d, "optics.elements", { id: uid("lens", d), type: "thinLens", position: { x: 0, y: 0 }, focalLength: 0.6, height: 1.4 }),
    },
    {
      label: "Plane mirror",
      add: (d) => push(d, "optics.elements", { id: uid("mirror", d), type: "planeMirror", from: { x: 1.5, y: -0.8 }, to: { x: 1.5, y: 0.8 } }),
    },
    {
      label: "Glass block",
      add: (d) =>
        push(d, "optics.elements", {
          id: uid("glass", d),
          type: "block",
          refractiveIndex: 1.5,
          vertices: [
            { x: 0, y: -1 },
            { x: 1, y: -1 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
        }),
    },
    {
      label: "Prism",
      add: (d) =>
        push(d, "optics.elements", {
          id: uid("prism", d),
          type: "block",
          refractiveIndex: 1.5,
          vertices: [
            { x: -0.8, y: -0.6 },
            { x: 0.8, y: -0.6 },
            { x: 0, y: 0.8 },
          ],
        }),
    },
    { label: "Laser ray", add: (d) => push(d, "optics.sources", { id: uid("ray", d), type: "ray", origin: { x: -2, y: 0.3 }, angle: -5 }) },
    {
      label: "Parallel beam",
      add: (d) => push(d, "optics.sources", { id: uid("beam", d), type: "beam", origin: { x: -2.5, y: 0 }, angle: 0, width: 0.6, count: 9 }),
    },
  ],
};

function push(d: Draft, path: string, item: unknown): Draft {
  const arr = (getPath(d, path) as unknown[] | undefined) ?? [];
  return setPath(d, path, [...arr, item]);
}

const BLANK: Record<string, () => Draft> = {
  mechanics: () => ({
    version: "1",
    id: "custom",
    title: "My mechanics scene",
    domain: "mechanics",
    duration: 4,
    mechanics: {
      bodies: [{ id: "block1", mass: 2, position: { x: 0, y: 0.2 }, onSurface: "floor1" }],
      surfaces: [{ id: "floor1", kind: "floor", from: { x: -3, y: 0 }, to: { x: 3, y: 0 } }],
      pulleys: [],
      ropes: [],
      springs: [],
      links: [],
    },
    params: [],
  }),
  circuits: () => ({
    version: "1",
    id: "custom",
    title: "My circuit",
    domain: "circuits",
    duration: 1,
    circuit: {
      ground: "g",
      nodes: [
        { id: "g", position: { x: 0, y: 0 }, extra: [{ x: 3, y: 0 }] },
        { id: "n1", position: { x: 0, y: 2 } },
        { id: "n2", position: { x: 3, y: 2 } },
      ],
      components: [
        { id: "V1", type: "voltageSource", a: "n1", b: "g", voltage: 6 },
        { id: "R1", type: "resistor", a: "n1", b: "n2", resistance: 100 },
        { id: "R2", type: "resistor", a: "n2", b: "g", resistance: 200 },
      ],
    },
    params: [],
  }),
  optics: () => ({
    version: "1",
    id: "custom",
    title: "My optical bench",
    domain: "optics",
    optics: {
      elements: [{ id: "lens1", type: "thinLens", position: { x: 0, y: 0 }, focalLength: 0.6, height: 1.4 }],
      sources: [{ id: "beam1", type: "beam", origin: { x: -2.5, y: 0 }, angle: 0, width: 0.8, count: 9 }],
      worldSize: 4,
    },
    params: [],
  }),
};

export function Build() {
  const [draft, setDraft] = useState<Draft>(() => JSON.parse(JSON.stringify(getScene())) as Draft);
  const [tab, setTab] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const cam = useRef<Camera | null>(null);
  const drag = useRef<{ path: string; cam: Camera } | null>(null);
  const lastValid = useRef<Scene>(getScene());

  const v = useMemo(() => validateScene(draft), [draft]);
  if (v.ok) lastValid.current = v.scene;
  const shown = lastValid.current;
  const issues: ValidationIssue[] = v.ok ? v.warnings : v.issues;

  const edit = (next: Draft) => {
    // geometry edits detach the scene from its template; sliders become direct-path params
    if (next.template) {
      const { template: _t, ...rest } = next;
      void _t;
      next = { ...rest, params: autoParams(rest) };
    }
    setDraft(next);
  };

  const ref = useCanvas(
    (ctx, w, h) => {
      const sc = shown;
      if (sc.domain === "mechanics")
        cam.current = drag.current?.cam
          ? drawMechanics(ctx, w, h, sc, null, { frame: 0, forces: false, velocity: false, selected: null, trail: false }, drag.current.cam)
          : drawMechanics(ctx, w, h, sc, null, { frame: 0, forces: false, velocity: false, selected: null, trail: false });
      else if (sc.domain === "circuits") cam.current = drawCircuit(ctx, w, h, sc, null, { frame: 0, clock: 0, reducedMotion: true });
      else cam.current = drawOptics(ctx, w, h, sc, traceOptics(sc.optics!), { reveal: 1 });
      // handles
      for (const hd of handles(draft)) {
        const c = drag.current?.cam ?? cam.current!;
        ctx.beginPath();
        ctx.arc(c.toX(hd.x), c.toY(hd.y), hd.path === sel ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = hd.path === sel ? cssVar("--signal") : "transparent";
        ctx.strokeStyle = cssVar("--signal");
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      }
    },
    [shown, draft, sel],
  );

  const pick = (px: number, py: number) => {
    const c = cam.current;
    if (!c) return null;
    let best: string | null = null,
      bd = 16;
    for (const hd of handles(draft)) {
      const d = Math.hypot(c.toX(hd.x) - px, c.toY(hd.y) - py);
      if (d < bd) {
        bd = d;
        best = hd.path;
      }
    }
    return best;
  };

  const selObjPath = sel ? sel.split(".").slice(0, -1).join(".") : null;
  // the inspected item is the array element that owns the handle
  const itemPath = sel
    ? sel
        .split(".")
        .reduce<string[]>((acc, k, i, arr) => (acc.length === 0 && /^\d+$/.test(k) ? arr.slice(0, i + 1) : acc), [])
        .join(".")
    : null;
  const item = itemPath ? (getPath(draft, itemPath) as Record<string, unknown> | undefined) : undefined;
  void selObjPath;

  const domainKey = draft.domain === "circuits" ? "circuits" : (draft.domain as string);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Scene builder</h1>
          <p className="text-muted mt-1 max-w-2xl">
            Drag the orange handles to move things, add parts from the palette, and tune any value in the inspector. Works without any AI.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <label className="text-sm flex items-center gap-2">
            Start from
            <select
              className="field !py-2 w-auto"
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                setSel(null);
                setDraft(val.startsWith("blank:") ? BLANK[val.slice(6)]() : (JSON.parse(JSON.stringify(exampleScene(val))) as Draft));
              }}
            >
              <option value="">choose…</option>
              <optgroup label="Blank">
                <option value="blank:mechanics">Blank mechanics</option>
                <option value="blank:circuits">Blank circuit</option>
                <option value="blank:optics">Blank optics</option>
              </optgroup>
              <optgroup label="Examples">
                {EXAMPLES.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button
            className="btn btn-primary"
            disabled={!v.ok}
            onClick={() => {
              if (!v.ok) return;
              setScene(v.scene, { source: "builder", confidence: 1, found: [], assumed: [], uncertain: [] });
              go("lab");
            }}
          >
            Run in the lab <Icon name="arrowRight" size={18} />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <section className="card overflow-hidden" aria-label="Scene canvas and editor">
          <div role="tablist" aria-label="Editor mode" className="flex gap-1 p-2 border-b border-line">
            {(["visual", "json"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === k ? "bg-ink text-paper" : "text-muted"}`}
                onClick={() => {
                  setTab(k);
                  if (k === "json") {
                    setJsonText(JSON.stringify(draft, null, 2));
                    setJsonErr(null);
                  }
                }}
              >
                {k === "visual" ? "Visual" : "Scene Graph JSON"}
              </button>
            ))}
          </div>
          {tab === "visual" ? (
            <canvas
              ref={ref}
              style={{ width: "100%", height: "60vh", minHeight: 320, touchAction: "none", cursor: "crosshair" }}
              aria-label="Scene canvas. Drag handles to move parts; use the inspector for exact values."
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const p = pick(e.clientX - r.left, e.clientY - r.top);
                setSel(p);
                if (p && cam.current) {
                  drag.current = { path: p, cam: cam.current };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const r = e.currentTarget.getBoundingClientRect();
                const c = drag.current.cam;
                const snap = (x: number) => Math.round(x * 20) / 20;
                edit(setPath(draft, drag.current.path, { x: snap(c.fromX(e.clientX - r.left)), y: snap(c.fromY(e.clientY - r.top)) }));
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
            />
          ) : (
            <div className="p-3 grid gap-2">
              <label htmlFor="json-edit" className="sr-only">
                Scene Graph JSON
              </label>
              <textarea
                id="json-edit"
                className="field num text-xs min-h-[60vh]"
                spellCheck={false}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
              <div className="flex gap-2 items-center">
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      setDraft(JSON.parse(jsonText) as Draft);
                      setJsonErr(null);
                    } catch (er) {
                      setJsonErr((er as Error).message);
                    }
                  }}
                >
                  Apply JSON
                </button>
                {jsonErr && <span className="text-sm text-bad">{jsonErr}</span>}
              </div>
            </div>
          )}
          <div className={`px-4 py-2 border-t border-line text-sm ${v.ok ? "text-ok" : "text-bad"}`} role="status" aria-live="polite">
            <span className="inline-flex items-center gap-1.5">
              <Icon name={v.ok ? "check" : "alert"} size={16} />
              {v.ok
                ? `Valid scene${issues.length ? ` (${issues.length} warning${issues.length > 1 ? "s" : ""})` : ""}`
                : `${issues.length} problem${issues.length > 1 ? "s" : ""} — the canvas shows the last valid version`}
            </span>
            {issues.length > 0 && (
              <ul className="text-xs mt-1 grid gap-0.5">
                {issues.slice(0, 6).map((i, k) => (
                  <li key={k}>
                    <code>{i.path || "scene"}</code>: {i.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="grid gap-4">
          <section className="card p-4 grid gap-2" aria-labelledby="palette-h">
            <h2 id="palette-h" className="font-display text-lg">
              Add parts
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {(PALETTE[domainKey] ?? []).map((p) => (
                <button key={p.label} className="chip hover:!border-ink hover:!text-ink !py-1" onClick={() => edit(p.add(draft))}>
                  + {p.label}
                </button>
              ))}
            </div>
            <label className="text-sm grid gap-1 mt-2">
              Title
              <input className="field" value={String(draft.title ?? "")} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            {draft.domain !== "optics" && (
              <label className="text-sm grid gap-1">
                Duration (s)
                <input
                  className="field num"
                  type="number"
                  step="any"
                  value={Number(draft.duration ?? 4)}
                  onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}
                />
              </label>
            )}
          </section>
          <section className="card p-4 grid gap-2" aria-labelledby="inspector-h">
            <h2 id="inspector-h" className="font-display text-lg">
              Inspector
            </h2>
            {!item || !itemPath ? (
              <p className="text-sm text-muted">Select a handle on the canvas to edit that part.</p>
            ) : (
              <>
                <p className="text-xs text-muted num">{itemPath}</p>
                {Object.entries(item).map(([k, val]) =>
                  typeof val === "number" ? (
                    <label key={k} className="text-sm grid grid-cols-[1fr_7rem] items-center gap-2">
                      {k}
                      <input
                        className="field num !py-1"
                        type="number"
                        step="any"
                        value={val}
                        onChange={(e) => edit(setPath(draft, `${itemPath}.${k}`, Number(e.target.value)))}
                      />
                    </label>
                  ) : typeof val === "string" ? (
                    <label key={k} className="text-sm grid grid-cols-[1fr_7rem] items-center gap-2">
                      {k}
                      <input className="field !py-1" value={val} onChange={(e) => edit(setPath(draft, `${itemPath}.${k}`, e.target.value))} />
                    </label>
                  ) : typeof val === "boolean" ? (
                    <label key={k} className="text-sm flex justify-between">
                      {k}
                      <input type="checkbox" checked={val} onChange={(e) => edit(setPath(draft, `${itemPath}.${k}`, e.target.checked))} />
                    </label>
                  ) : val && typeof val === "object" && "x" in (val as object) ? (
                    <div key={k} className="text-sm grid grid-cols-[1fr_3.4rem_3.4rem] items-center gap-1">
                      {k}
                      {(["x", "y"] as const).map((c) => (
                        <input
                          key={c}
                          aria-label={`${k} ${c}`}
                          className="field num !py-1 !px-1.5"
                          type="number"
                          step="any"
                          value={(val as Record<string, number>)[c]}
                          onChange={(e) => edit(setPath(draft, `${itemPath}.${k}.${c}`, Number(e.target.value)))}
                        />
                      ))}
                    </div>
                  ) : null,
                )}
                <button
                  className="btn !min-h-9 text-sm text-bad"
                  onClick={() => {
                    const arrPath = itemPath.split(".").slice(0, -1).join(".");
                    const idx = Number(itemPath.split(".").pop());
                    const arr = (getPath(draft, arrPath) as unknown[]).filter((_, i) => i !== idx);
                    setSel(null);
                    edit(setPath(draft, arrPath, arr));
                  }}
                >
                  Delete this part
                </button>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
