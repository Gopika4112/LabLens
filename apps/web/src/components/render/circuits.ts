/** Canvas renderer for circuit schematics with live current flow. */
import type { Scene, CircuitResult, Component } from "@lablens/engine";
import { fmt } from "@lablens/engine";
import { cssVar, fitCamera, type Camera } from "../../lib/useCanvas";

type P = { x: number; y: number };

/** Node points (primary + extras), with an automatic ring layout when the scene has none. */
export function nodePoints(scene: Scene): Map<string, P[]> {
  const c = scene.circuit!;
  const out = new Map<string, P[]>();
  const missing = c.nodes.filter((n) => !n.position);
  c.nodes.forEach((n, i) => {
    if (n.position) out.set(n.id, [n.position, ...n.extra]);
    else {
      const k = missing.indexOf(n);
      const a = (2 * Math.PI * k) / missing.length - Math.PI / 2;
      out.set(n.id, [{ x: 2 + 2 * Math.cos(a), y: 1 + 1.5 * Math.sin(a) }]);
      void i;
    }
  });
  return out;
}

/** Endpoints for a component: the closest pair of points of its two nodes. */
export function componentEnds(pts: Map<string, P[]>, k: Component): [P, P] {
  const A = pts.get(k.a) ?? [{ x: 0, y: 0 }],
    B = pts.get(k.b) ?? [{ x: 1, y: 0 }];
  let best: [P, P] = [A[0], B[0]],
    bd = Infinity;
  for (const a of A)
    for (const b of B) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 1e-9 && d < bd) {
        bd = d;
        best = [a, b];
      }
    }
  return best;
}

export function circuitBounds(scene: Scene) {
  const pts = [...nodePoints(scene).values()].flat();
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs) - 0.9, maxX: Math.max(...xs) + 1.5, minY: Math.min(...ys) - 0.6, maxY: Math.max(...ys) + 0.6 };
}

function symbol(
  ctx: CanvasRenderingContext2D,
  k: Component,
  len: number,
  state: { v: number; i: number; vMax: number; pMax: number; p: number; closed: boolean },
  ink: string,
  panel: string,
) {
  // drawn along +x, centred at origin, total symbol length ~ min(len, 60)
  const L = Math.min(len * 0.55, 64);
  const h = L / 2;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(-h, 0);
  ctx.moveTo(h, 0);
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  switch (k.type) {
    case "resistor": {
      ctx.beginPath();
      ctx.moveTo(-h, 0);
      const n = 6;
      for (let j = 0; j < n; j++) ctx.lineTo(-h + (L * (j + 0.5)) / n, j % 2 ? 9 : -9);
      ctx.lineTo(h, 0);
      ctx.stroke();
      break;
    }
    case "lamp": {
      const glow = state.pMax > 0 ? Math.min(1, Math.abs(state.p) / state.pMax) : 0;
      if (glow > 0.02) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
        g.addColorStop(0, `rgba(255, 196, 64, ${0.85 * glow})`);
        g.addColorStop(1, "rgba(255, 196, 64, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-9, -9);
      ctx.lineTo(9, 9);
      ctx.moveTo(-9, 9);
      ctx.lineTo(9, -9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-h, 0);
      ctx.lineTo(-13, 0);
      ctx.moveTo(13, 0);
      ctx.lineTo(h, 0);
      ctx.stroke();
      break;
    }
    case "capacitor": {
      ctx.beginPath();
      ctx.moveTo(-h, 0);
      ctx.lineTo(-5, 0);
      ctx.moveTo(5, 0);
      ctx.lineTo(h, 0);
      ctx.stroke();
      const fill = state.vMax > 0 ? Math.min(1, Math.abs(state.v) / state.vMax) : 0;
      ctx.fillStyle = cssVar("--signal");
      ctx.globalAlpha = 0.25 + 0.6 * fill;
      ctx.fillRect(-5, -16 * fill, 10, 32 * fill);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-5, -16);
      ctx.lineTo(-5, 16);
      ctx.moveTo(5, -16);
      ctx.lineTo(5, 16);
      ctx.stroke();
      break;
    }
    case "inductor": {
      ctx.beginPath();
      ctx.moveTo(-h, 0);
      const n = 4,
        r = L / (2 * n);
      for (let j = 0; j < n; j++) ctx.arc(-h + r * (2 * j + 1), 0, r, Math.PI, 0, false);
      ctx.stroke();
      break;
    }
    case "voltageSource": {
      ctx.beginPath();
      ctx.moveTo(-h, 0);
      ctx.lineTo(-4, 0);
      ctx.moveTo(4, 0);
      ctx.lineTo(h, 0);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-4, -16);
      ctx.lineTo(-4, 16); // long plate (+) at the `a` side
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(4, -8);
      ctx.lineTo(4, 8);
      ctx.stroke();
      ctx.font = "600 12px 'IBM Plex Mono', monospace";
      ctx.fillStyle = ink;
      ctx.fillText("+", -16, -12);
      break;
    }
    case "currentSource": {
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.lineTo(2, -5);
      ctx.moveTo(7, 0);
      ctx.lineTo(2, 5);
      ctx.stroke();
      break;
    }
    case "switch": {
      ctx.beginPath();
      ctx.arc(-h * 0.6, 0, 3.5, 0, Math.PI * 2);
      ctx.arc(h * 0.6, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-h, 0);
      ctx.lineTo(-h * 0.6, 0);
      ctx.moveTo(h * 0.6, 0);
      ctx.lineTo(h, 0);
      ctx.moveTo(-h * 0.6, 0);
      if (state.closed) ctx.lineTo(h * 0.6, 0);
      else ctx.lineTo(h * 0.5, -h * 0.55);
      ctx.stroke();
      break;
    }
  }
}

export interface CircuitDrawOpts {
  frame: number;
  /** animation clock (s, wall time) for the moving current dots */
  clock: number;
  reducedMotion: boolean;
  /** gallery thumbnail: symbols only, no value labels */
  thumb?: boolean;
}

export function drawCircuit(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene, outIn: CircuitResult | null, o: CircuitDrawOpts): Camera {
  const c = scene.circuit!;
  const out = outIn && outIn.componentIds.length === c.components.length ? outIn : null;
  const cam = fitCamera(circuitBounds(scene), w, h, o.thumb ? 14 : 30);
  const ink = cssVar("--ink"),
    muted = cssVar("--muted"),
    panel = cssVar("--panel"),
    signal = cssVar("--signal");
  const pts = nodePoints(scene);
  const f = out ? out.frames[Math.min(o.frame, out.frames.length - 1)] : null;
  const X = cam.toX,
    Y = cam.toY;
  let vMax = 1e-12,
    iMax = 1e-12,
    pMax = 1e-12;
  if (out)
    for (const fr of out.frames) {
      fr.compV.forEach((v) => (vMax = Math.max(vMax, Math.abs(v))));
      fr.compI.forEach((v) => (iMax = Math.max(iMax, Math.abs(v))));
      fr.compP.forEach((v) => (pMax = Math.max(pMax, Math.abs(v))));
    }

  // node wires
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.2;
  for (const [, list] of pts) {
    if (list.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(X(list[0].x), Y(list[0].y));
    for (const p of list.slice(1)) ctx.lineTo(X(p.x), Y(p.y));
    ctx.stroke();
  }
  ctx.restore();

  // components
  c.components.forEach((k, idx) => {
    const [a, b] = componentEnds(pts, k);
    const ax = X(a.x),
      ay = Y(a.y),
      bx = X(b.x),
      by = Y(b.y);
    const len = Math.hypot(bx - ax, by - ay);
    const ang = Math.atan2(by - ay, bx - ax);
    const v = f ? f.compV[idx] : 0,
      i = f ? f.compI[idx] : 0,
      p = f ? f.compP[idx] : 0;
    const closed = k.type === "switch" ? (f ? f.t > k.closeAt || (f.t === k.closeAt && Math.abs(i) > 0) : k.closeAt <= 0) : true;
    ctx.save();
    ctx.translate((ax + bx) / 2, (ay + by) / 2);
    ctx.rotate(ang);
    symbol(ctx, k, len, { v, i, vMax, pMax, p, closed }, ink, panel);
    // current dots: conventional current a → b when i > 0
    if (f && Math.abs(i) > iMax * 0.002 && !o.reducedMotion) {
      const speed = 40 + 120 * Math.min(1, Math.abs(i) / iMax);
      const spacing = 22;
      const offset = (((o.clock * speed * Math.sign(i)) % spacing) + spacing) % spacing;
      ctx.fillStyle = signal;
      for (let s = -len / 2 + offset; s < len / 2; s += spacing) {
        ctx.beginPath();
        ctx.arc(s, 0, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // label
    const mx = (ax + bx) / 2,
      my = (ay + by) / 2;
    const vertical = Math.abs(Math.sin(ang)) > 0.7;
    ctx.save();
    ctx.font = "600 12px 'IBM Plex Sans', sans-serif";
    ctx.fillStyle = ink;
    ctx.textAlign = vertical ? "left" : "center";
    const lx = vertical ? mx + 24 : mx,
      ly = vertical ? my - 6 : my - 22;
    const value =
      k.type === "resistor" || k.type === "lamp"
        ? fmt(k.resistance, "Ω")
        : k.type === "capacitor"
          ? fmt(k.capacitance, "F")
          : k.type === "inductor"
            ? fmt(k.inductance, "H")
            : k.type === "voltageSource"
              ? fmt(k.voltage, "V")
              : k.type === "currentSource"
                ? fmt(k.current, "A")
                : closed
                  ? "closed"
                  : "open";
    if (!o.thumb) ctx.fillText(`${k.label ?? k.id} · ${value}`, lx, ly);
    if (f && k.type !== "switch") {
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = muted;
      ctx.fillText(`${fmt(Math.abs(v), "V")}  ${fmt(Math.abs(i), "A")}`, lx, ly + (vertical ? 15 : 44));
    }
    ctx.restore();
  });

  // node dots + voltages
  for (const [id, list] of pts) {
    const ni = c.nodes.findIndex((n) => n.id === id);
    ctx.save();
    ctx.fillStyle = ink;
    for (const p of list) {
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (id === c.ground) {
      const g = list[0];
      const gx = X(g.x),
        gy = Y(g.y) + 4;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx, gy + 10);
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(gx - 12 + k * 4, gy + 10 + k * 4);
        ctx.lineTo(gx + 12 - k * 4, gy + 10 + k * 4);
      }
      ctx.stroke();
    } else if (f) {
      const p = list[0];
      ctx.font = "500 11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = signal;
      ctx.fillText(fmt(f.nodeV[ni], "V"), X(p.x) + 6, Y(p.y) - 8);
    }
    ctx.restore();
  }

  if (f) {
    ctx.save();
    ctx.font = "500 13px 'IBM Plex Mono', monospace";
    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.fillText(`t = ${fmt(f.t, "s")}`, w - 14, 22);
    ctx.restore();
  }
  return cam;
}
