import { fmt, type Scene, type SimOutput, type ForceVec } from "@lablens/engine";
import { cssVar, useCanvas } from "../lib/useCanvas";
import { FORCE_SHORT, FORCE_VAR } from "./render/mechanics";

/** Auto-generated free-body diagram for the selected body, as a drawing AND as an accessible list. */
export function FreeBody({
  scene,
  output,
  frame,
  selected,
  onSelect,
}: {
  scene: Scene;
  output: SimOutput | null;
  frame: number;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const m = scene.mechanics!;
  const f = output?.domain === "mechanics" ? output.result.frames[Math.min(frame, output.result.frames.length - 1)] : null;
  const forces: ForceVec[] = f ? (f.forces[selected] ?? []) : [];
  const net = forces.reduce((s, v) => ({ x: s.x + v.fx, y: s.y + v.fy }), { x: 0, y: 0 });
  const ref = useCanvas(
    (ctx, w, h) => {
      const cx = w / 2,
        cy = h / 2;
      const max = Math.max(1e-9, ...forces.map((v) => Math.hypot(v.fx, v.fy)));
      const k = (Math.min(w, h) * 0.38) / max;
      ctx.fillStyle = cssVar("--ink");
      ctx.beginPath();
      ctx.roundRect(cx - 12, cy - 12, 24, 24, 4);
      ctx.fill();
      for (const v of forces) {
        const L = Math.hypot(v.fx, v.fy);
        if (L < max * 0.01) continue;
        const ex = cx + v.fx * k,
          ey = cy - v.fy * k;
        const col = cssVar(FORCE_VAR[v.kind]);
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const ux = (ex - cx) / (L * k),
          uy = (ey - cy) / (L * k);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ux * 10 - uy * 5, ey - uy * 10 + ux * 5);
        ctx.lineTo(ex - ux * 10 + uy * 5, ey - uy * 10 - ux * 5);
        ctx.fill();
        ctx.font = "600 12px 'IBM Plex Mono', monospace";
        ctx.textAlign = ux >= 0 ? "left" : "right";
        ctx.fillText(FORCE_SHORT[v.kind], ex + ux * 6, ey + uy * 6 + 4);
      }
    },
    [forces],
  );
  return (
    <div className="grid gap-2">
      {m.bodies.length > 1 && (
        <label className="text-sm flex items-center gap-2">
          Body
          <select className="field !py-1.5 w-auto" value={selected} onChange={(e) => onSelect(Number(e.target.value))}>
            {m.bodies.map((b, i) => (
              <option key={b.id} value={i}>
                {b.label ?? b.id} ({fmt(b.mass, "kg")})
              </option>
            ))}
          </select>
        </label>
      )}
      <canvas ref={ref} style={{ width: "100%", height: 170 }} aria-hidden />
      <ul className="text-sm grid gap-1" aria-label={`Forces on ${m.bodies[selected]?.label ?? "body"}`}>
        {forces.map((v, i) => {
          const mag = Math.hypot(v.fx, v.fy);
          const ang = (Math.atan2(v.fy, v.fx) * 180) / Math.PI;
          return (
            <li key={i} className="flex justify-between gap-2">
              <span className="flex items-center gap-2">
                <span aria-hidden className="inline-block w-3 h-3 rounded-full" style={{ background: `var(${FORCE_VAR[v.kind]})` }} />
                {v.label}
              </span>
              <span className="num">
                {fmt(mag, "N")} <span className="text-muted">at {ang.toFixed(0)}°</span>
              </span>
            </li>
          );
        })}
        <li className="flex justify-between gap-2 border-t border-line pt-1 font-medium">
          <span>Net force (= m·a)</span>
          <span className="num">{fmt(Math.hypot(net.x, net.y), "N")}</span>
        </li>
      </ul>
    </div>
  );
}
