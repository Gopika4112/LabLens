/** Canvas renderer for mechanics scenes (pure drawing; no React). */
import type { Scene, MechResult, ForceKind, MechFrame } from "@lablens/engine";
import { fmt } from "@lablens/engine";
import { cssVar, fitCamera, type Camera } from "../../lib/useCanvas";

export const FORCE_VAR: Record<ForceKind, string> = {
  gravity: "--f-gravity",
  normal: "--f-normal",
  friction: "--f-friction",
  tension: "--f-tension",
  spring: "--f-spring",
  drag: "--f-drag",
  applied: "--f-applied",
};

export const FORCE_SHORT: Record<ForceKind, string> = {
  gravity: "W",
  normal: "N",
  friction: "f",
  tension: "T",
  spring: "Fₛ",
  drag: "D",
  applied: "F",
};

export interface MechDrawOpts {
  frame: number;
  forces: boolean;
  velocity: boolean;
  selected: number | null;
  trail: boolean;
  /** gallery thumbnail: no scale bar or text labels, tighter fit */
  thumb?: boolean;
}

export function mechBounds(scene: Scene, out: MechResult | null) {
  const m = scene.mechanics!;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const add = (x: number, y: number, r = 0) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  };
  m.bodies.forEach((b) => add(b.position.x, b.position.y, b.size));
  m.pulleys.forEach((p) => add(p.position.x, p.position.y, p.radius + 0.2));
  m.links.forEach((l) => add(l.pivot.x, l.pivot.y, 0.2));
  m.springs.forEach((s) => s.anchorB && add(s.anchorB.x, s.anchorB.y, 0.2));
  if (out) for (const f of out.frames) f.bodies.forEach((b, i) => add(b.x, b.y, m.bodies[i].size));
  // surfaces: include only the part near the action (long floors would shrink everything)
  const cx0 = minX,
    cx1 = maxX;
  for (const s of m.surfaces) {
    const clampX = (x: number) => Math.min(Math.max(x, cx0 - 1), cx1 + 1);
    const pts = [s.from, s.to].map((p) => ({ x: clampX(p.x), y: p.y }));
    pts.forEach((p) => add(p.x, p.y));
  }
  // pendulum: show the full swing arc symmetrically
  m.links.forEach((l) => {
    const L = l.length ?? 1;
    add(l.pivot.x - L, l.pivot.y - L);
    add(l.pivot.x + L, l.pivot.y);
  });
  const padX = (maxX - minX) * 0.04 + 0.25,
    padY = (maxY - minY) * 0.05 + 0.25;
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Box of a left/right-aligned, middle-baseline label. */
function textBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: "left" | "right", size: number): Box {
  const tw = ctx.measureText(text).width;
  const x0 = align === "left" ? x : x - tw;
  return { x0: x0 - 3, y0: y - size / 2 - 3, x1: x0 + tw + 3, y1: y + size / 2 + 3 };
}

/**
 * Place a label near an arrow tip without covering other labels, bodies or scene text:
 * try spots just past the tip, then to either side of the arrow, then further out; take the first
 * that is clear and on-canvas, otherwise the least-overlapping one. Returns the chosen anchor.
 */
export function placeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  taken: Box[],
  w: number,
  h: number,
  size: number,
): { x: number; y: number; align: "left" | "right"; box: Box } {
  const len = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / len,
    dy = dirY / len;
  const px = -dy,
    py = dx;
  const steps: [number, number][] = [
    [8, 0],
    [8, 1],
    [8, -1],
    [22, 0],
    [8, 2],
    [8, -2],
    [36, 0],
    [22, 2],
    [22, -2],
    [-14, 2],
    [-14, -2],
    [52, 0],
  ];
  let best: { x: number; y: number; align: "left" | "right"; box: Box } | null = null;
  let bestCost = Infinity;
  for (const [along, side] of steps) {
    const x = tipX + dx * along + px * side * (size + 2);
    const y = tipY + dy * along + py * side * (size + 2);
    // text grows away from the arrow: rightwards for arrows pointing right, else leftwards
    const align: "left" | "right" = dx > 0.2 || (Math.abs(dx) <= 0.2 && x < w / 2) ? "left" : "right";
    const box = textBox(ctx, text, x, y, align, size);
    const off = Math.max(0, -box.x0) + Math.max(0, box.x1 - w) + Math.max(0, -box.y0) + Math.max(0, box.y1 - h);
    const cost = taken.reduce((c, t) => c + overlap(box, t), 0) + off * 50;
    if (cost < bestCost) {
      best = { x, y, align, box };
      bestCost = cost;
      if (cost === 0) break;
    }
  }
  return best!;
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 2.5, dashed = false) {
  const dx = x1 - x0,
    dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 2) return;
  const ux = dx / L,
    uy = dy / L;
  const head = Math.min(11, L * 0.45);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  if (dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5);
  ctx.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function hatchLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, below = true) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.floor(L / 9);
  const ux = (x1 - x0) / L,
    uy = (y1 - y0) / L;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = x0 + ux * i * 9,
      y = y0 + uy * i * 9;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y + (below ? 8 : -8));
  }
  ctx.stroke();
  ctx.restore();
}

export function drawMechanics(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: Scene,
  outIn: MechResult | null,
  o: MechDrawOpts,
  camIn?: Camera,
): Camera {
  const m = scene.mechanics!;
  // never pair a scene with frames from a structurally different scene
  const out = outIn && outIn.frames[0]?.bodies.length === m.bodies.length && outIn.ropeGuides.length === m.ropes.length ? outIn : null;
  const cam = camIn ?? fitCamera(mechBounds(scene, out), w, h, o.thumb ? 16 : 28);
  const ink = cssVar("--ink"),
    muted = cssVar("--muted"),
    line = cssVar("--line"),
    panel = cssVar("--panel"),
    signal = cssVar("--signal");
  const f: MechFrame | null = out ? out.frames[Math.min(o.frame, out.frames.length - 1)] : null;
  const pos = (i: number) => (f ? { x: f.bodies[i].x, y: f.bodies[i].y } : m.bodies[i].position);
  const X = cam.toX,
    Y = cam.toY,
    S = cam.scale;
  /** screen boxes already occupied by text or bodies, so force labels can avoid them */
  const taken: Box[] = [{ x0: w - 120, y0: 6, x1: w, y1: 32 }]; // the clock, top right

  // metre grid + scale bar
  ctx.save();
  ctx.strokeStyle = line;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  const x0 = Math.floor(cam.fromX(0)),
    x1 = Math.ceil(cam.fromX(w)),
    y0 = Math.floor(cam.fromY(h)),
    y1 = Math.ceil(cam.fromY(0));
  const stepM = S > 40 ? 1 : S > 8 ? 5 : 10;
  ctx.beginPath();
  for (let x = Math.ceil(x0 / stepM) * stepM; x <= x1; x += stepM) {
    ctx.moveTo(X(x), 0);
    ctx.lineTo(X(x), h);
  }
  for (let y = Math.ceil(y0 / stepM) * stepM; y <= y1; y += stepM) {
    ctx.moveTo(0, Y(y));
    ctx.lineTo(w, Y(y));
  }
  ctx.stroke();
  ctx.restore();
  if (!o.thumb) {
    ctx.save();
    ctx.fillStyle = muted;
    ctx.strokeStyle = muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, h - 14);
    ctx.lineTo(14 + stepM * S, h - 14);
    ctx.stroke();
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillText(`${stepM} m`, 16, h - 20);
    ctx.restore();
  }

  // surfaces
  for (const s of m.surfaces) {
    const ax = X(s.from.x),
      ay = Y(s.from.y),
      bx = X(s.to.x),
      by = Y(s.to.y);
    ctx.save();
    if (s.kind === "incline" || s.kind === "ramp") {
      // solid wedge under the slope, with diagonal hatching
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      if (by < ay) ctx.lineTo(bx, ay);
      else ctx.lineTo(ax, by);
      ctx.closePath();
      ctx.fillStyle = line;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      // angle arc
      const ang = Math.atan2(Math.abs(s.to.y - s.from.y), Math.abs(s.to.x - s.from.x));
      const cornerX = by < ay ? ax : bx,
        cornerY = Math.max(ay, by);
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (by < ay) ctx.arc(cornerX, cornerY, 34, -ang, 0);
      else ctx.arc(cornerX, cornerY, 34, Math.PI, Math.PI + ang);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      const deg = Math.round((ang * 180) / Math.PI);
      if (!o.thumb) {
        const lx = by < ay ? cornerX + 40 : cornerX - 64;
        ctx.fillText(`${deg}°`, lx, cornerY - 8);
        taken.push({ x0: lx - 2, y0: cornerY - 22, x1: lx + ctx.measureText(`${deg}°`).width + 2, y1: cornerY - 2 });
      }
    }
    if (s.kind === "table") {
      ctx.fillStyle = line;
      ctx.fillRect(Math.min(ax, bx), ay, Math.abs(bx - ax), 10);
      ctx.fillRect(Math.min(ax, bx) + 8, ay + 10, 8, 0.9 * S);
      ctx.fillRect(Math.max(ax, bx) - 16, ay + 10, 8, 0.9 * S);
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    if (s.kind === "floor" || s.kind === "wall") hatchLine(ctx, ax, ay, bx, by, muted);
    if (s.muKinetic > 0 && !o.thumb) {
      ctx.fillStyle = muted;
      ctx.font = "11px 'IBM Plex Mono', monospace";
      const mx = (ax + bx) / 2,
        my = (ay + by) / 2;
      // just below the surface's midpoint, sliding along it if the angle label is in the way
      const text = `μk ${s.muKinetic}`;
      ctx.textBaseline = "middle";
      const at = placeLabel(ctx, text, mx, my + 16, bx - ax, by - ay, taken, w, h, 11);
      ctx.textAlign = at.align;
      ctx.fillText(text, at.x, at.y);
      taken.push(at.box);
    }
    ctx.restore();
  }

  // pulleys
  for (const p of m.pulleys) {
    const px = X(p.position.x),
      py = Y(p.position.y),
      r = p.radius * S;
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    // bracket
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + r * 0.3, py + r * 1.6);
    ctx.lineTo(px - r * 0.3, py + r * 1.6);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = panel;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // spokes rotate with the rope
    const rot = f && out ? -((f.bodies[0].x - m.bodies[0].position.x + f.bodies[0].y - m.bodies[0].position.y) / p.radius) : 0;
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const a = rot + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * r * 0.85, py + Math.sin(a) * r * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ropes
  m.ropes.forEach((r, ri) => {
    const a = m.bodies.findIndex((b) => b.id === r.bodyA);
    const bI = r.bodyB ? m.bodies.findIndex((b) => b.id === r.bodyB) : -1;
    const guides =
      out?.ropeGuides[ri] ??
      r.via.map((v) => {
        const p = m.pulleys.find((q) => q.id === v.pulley)!;
        const d = { left: [-1, 0], right: [1, 0], top: [0, 1], bottom: [0, -1] }[v.side];
        return { x: p.position.x + d[0] * p.radius, y: p.position.y + d[1] * p.radius };
      });
    const pts = [pos(a), ...guides, bI >= 0 ? pos(bI) : r.anchorB!];
    const taut = f ? f.ropeTaut[ri] : true;
    ctx.save();
    ctx.strokeStyle = cssVar("--f-tension");
    ctx.lineWidth = 2;
    if (!taut) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(X(pts[0].x), Y(pts[0].y));
    for (let k = 1; k < pts.length; k++) {
      // wrap around the pulley between two guides of the same pulley
      if (k < pts.length - 1 && k >= 1 && guides.length >= 2 && k <= guides.length - 1) {
        const pul = m.pulleys.find((p) => p.id === r.via[k - 1].pulley)!;
        const c = { x: X(pul.position.x), y: Y(pul.position.y) };
        const a0 = Math.atan2(Y(pts[k].y) - c.y, X(pts[k].x) - c.x);
        const a1 = Math.atan2(Y(pts[k + 1].y) - c.y, X(pts[k + 1].x) - c.x);
        ctx.lineTo(X(pts[k].x), Y(pts[k].y));
        ctx.arc(c.x, c.y, pul.radius * S, a0, a1, false);
        continue;
      }
      ctx.lineTo(X(pts[k].x), Y(pts[k].y));
    }
    ctx.stroke();
    ctx.restore();
  });

  // springs
  m.springs.forEach((s) => {
    const a = m.bodies.findIndex((b) => b.id === s.bodyA);
    const pa = pos(a);
    const pb = s.bodyB ? pos(m.bodies.findIndex((b) => b.id === s.bodyB)) : s.anchorB!;
    const ax = X(pa.x),
      ay = Y(pa.y),
      bx = X(pb.x),
      by = Y(pb.y);
    const L = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / L,
      uy = (by - ay) / L;
    const coils = 12,
      amp = 7;
    ctx.save();
    ctx.strokeStyle = cssVar("--f-spring");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    const lead = Math.min(14, L * 0.15);
    ctx.lineTo(ax + ux * lead, ay + uy * lead);
    for (let k = 0; k <= coils; k++) {
      const t = lead + ((L - 2 * lead) * k) / coils;
      const side = k === 0 || k === coils ? 0 : k % 2 ? amp : -amp;
      ctx.lineTo(ax + ux * t - uy * side, ay + uy * t + ux * side);
    }
    ctx.lineTo(bx, by);
    ctx.stroke();
    if (!s.bodyB) {
      // wall/ceiling mount
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx - uy * 18, by + ux * 18);
      ctx.lineTo(bx + uy * 18, by - ux * 18);
      ctx.stroke();
    }
    ctx.restore();
  });

  // pendulum links
  m.links.forEach((l) => {
    const i = m.bodies.findIndex((b) => b.id === l.body);
    const p = pos(i);
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = l.kind === "rod" ? 3 : 1.6;
    ctx.beginPath();
    ctx.moveTo(X(l.pivot.x), Y(l.pivot.y));
    ctx.lineTo(X(p.x), Y(p.y));
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(X(l.pivot.x) - 22, Y(l.pivot.y));
    ctx.lineTo(X(l.pivot.x) + 22, Y(l.pivot.y));
    ctx.stroke();
    hatchLine(ctx, X(l.pivot.x) - 20, Y(l.pivot.y), X(l.pivot.x) + 22, Y(l.pivot.y), muted, false);
    // reference vertical
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(l.pivot.x), Y(l.pivot.y));
    ctx.lineTo(X(l.pivot.x), Y(l.pivot.y - (l.length ?? 1)));
    ctx.stroke();
    ctx.restore();
  });

  // trails for free bodies
  if (o.trail && out && f) {
    m.bodies.forEach((b, i) => {
      if (b.onSurface || m.links.some((l) => l.body === b.id) || m.ropes.length) return;
      ctx.save();
      ctx.strokeStyle = signal;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= o.frame && k < out.frames.length; k += 2) {
        const q = out.frames[k].bodies[i];
        if (k === 0) ctx.moveTo(X(q.x), Y(q.y));
        else ctx.lineTo(X(q.x), Y(q.y));
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  // bodies
  m.bodies.forEach((b, i) => {
    const p = pos(i);
    const cx = X(p.x),
      cy = Y(p.y);
    const half = (b.size / 2) * S;
    taken.push({ x0: cx - half * 1.2, y0: cy - half * 1.2, x1: cx + half * 1.2, y1: cy + half * 1.2 });
    let ang = 0;
    const contact = f ? f.contacts.find((c) => c.body === i) : b.onSurface ? { surface: m.surfaces.findIndex((s) => s.id === b.onSurface) } : undefined;
    if (contact && b.shape === "block") {
      const s = m.surfaces[contact.surface];
      ang = -Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x);
      if (Math.abs(ang) > Math.PI / 2) ang += Math.PI;
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const sel = o.selected === i;
    ctx.fillStyle = sel ? signal : ink;
    ctx.strokeStyle = sel ? signal : ink;
    if (b.shape === "ball") {
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(half, 5), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const r = Math.min(6, half * 0.25);
      ctx.beginPath();
      ctx.roundRect(-half, -half, 2 * half, 2 * half, r);
      ctx.fill();
    }
    ctx.rotate(-ang);
    ctx.fillStyle = sel ? cssVar("--signal-ink") : panel;
    ctx.font = `600 ${Math.max(10, Math.min(14, half * 0.6))}px 'IBM Plex Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (half > 12 && !o.thumb) ctx.fillText(`${fmt(b.mass)} kg`, 0, 0);
    ctx.restore();
  });

  // force + velocity arrows (free-body overlay). All arrows are drawn first and their shafts become
  // obstacles; then every label is placed so none sits on an arrow, a body, scene text or another label.
  if (f && (o.forces || o.velocity)) {
    let maxF = 1e-9;
    f.forces.forEach((list) => list.forEach((v) => (maxF = Math.max(maxF, Math.hypot(v.fx, v.fy)))));
    const pxPerN = Math.min(90, w * 0.12) / maxF;
    const labels: { tx: number; ty: number; dx: number; dy: number; text: string; color: string; weight: string; rank: number }[] = [];
    const shaft = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 7));
      for (let k = 1; k < n; k++) {
        const x = x0 + ((x1 - x0) * k) / n,
          y = y0 + ((y1 - y0) * k) / n;
        taken.push({ x0: x - 3, y0: y - 3, x1: x + 3, y1: y + 3 });
      }
    };
    m.bodies.forEach((_, i) => {
      // velocity-only view follows the selected body
      if (o.selected !== null && o.selected !== i && m.bodies.length > 1 && !o.forces) return;
      const cx = X(f.bodies[i].x),
        cy = Y(f.bodies[i].y);
      if (o.forces)
        for (const v of f.forces[i]) {
          const mag = Math.hypot(v.fx, v.fy);
          if (mag < maxF * 0.01) continue;
          const color = cssVar(FORCE_VAR[v.kind]);
          const ex = cx + v.fx * pxPerN,
            ey = cy - v.fy * pxPerN;
          arrow(ctx, cx, cy, ex, ey, color, 3);
          shaft(cx, cy, ex, ey);
          labels.push({ tx: ex, ty: ey, dx: v.fx, dy: -v.fy, text: `${FORCE_SHORT[v.kind]} ${fmt(mag, "N")}`, color, weight: "600", rank: mag * pxPerN });
        }
      if (o.velocity) {
        const vx = f.bodies[i].vx,
          vy = f.bodies[i].vy;
        const sp = Math.hypot(vx, vy);
        if (sp > 1e-3) {
          const len = Math.min(120, 18 + sp * 12);
          const ex = cx + (vx / sp) * len,
            ey = cy - (vy / sp) * len;
          arrow(ctx, cx, cy, ex, ey, cssVar("--f-velocity"), 2, true);
          shaft(cx, cy, ex, ey);
          labels.push({ tx: ex, ty: ey, dx: vx, dy: -vy, text: `v ${fmt(sp, "m/s")}`, color: ink, weight: "400", rank: len });
        }
      }
    });
    ctx.save();
    const size = w < 520 ? 11 : 12;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    // longest arrows first: they have the most room around their tips
    labels.sort((a, b) => b.rank - a.rank);
    for (const l of labels) {
      ctx.font = `${l.weight} ${size}px 'IBM Plex Mono', monospace`;
      const at = placeLabel(ctx, l.text, l.tx, l.ty, l.dx, l.dy, taken, w, h, size);
      taken.push(at.box);
      ctx.textAlign = at.align;
      ctx.strokeStyle = panel;
      ctx.strokeText(l.text, at.x, at.y);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, at.x, at.y);
    }
    ctx.restore();
  }

  // clock
  if (f) {
    ctx.save();
    ctx.font = "500 13px 'IBM Plex Mono', monospace";
    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.fillText(`t = ${f.t.toFixed(2)} s`, w - 14, 22);
    ctx.restore();
  }
  return cam;
}

/** Index of the body under a screen point, or null. */
export function hitBody(scene: Scene, out: MechResult | null, frame: number, cam: Camera, px: number, py: number): number | null {
  const m = scene.mechanics!;
  const f = out?.frames[Math.min(frame, out.frames.length - 1)];
  let best: number | null = null,
    bestD = Infinity;
  m.bodies.forEach((b, i) => {
    const p = f ? f.bodies[i] : b.position;
    const d = Math.hypot(cam.toX(p.x) - px, cam.toY(p.y) - py);
    const r = Math.max(18, (b.size / 2) * cam.scale + 6);
    if (d < r && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
