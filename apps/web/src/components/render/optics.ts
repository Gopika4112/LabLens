/** Canvas renderer for the optical bench. */
import type { Scene, OpticsResult, OpticalElement, Verification } from "@lablens/engine";
import { cssVar, fitCamera, type Camera } from "../../lib/useCanvas";

export function opticsBounds(scene: Scene, out?: OpticsResult | null) {
  const o = scene.optics!;
  const W = o.worldSize;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const s of o.sources) add(s.origin.x, s.origin.y);
  for (const e of o.elements) {
    if ("position" in e) add(e.position.x, e.position.y);
    if ("vertex" in e) add(e.vertex.x, e.vertex.y);
    if ("center" in e) add(e.center.x, e.center.y);
    if ("vertices" in e) e.vertices.forEach((v) => add(v.x, v.y));
  }
  // keep where the light actually goes in view (clamped to the world box below)
  if (out) for (const r of out.rays) for (const p of r.points.slice(0, -1)) add(p.x, p.y);
  add(minX - 0.4, minY - 0.75);
  add(maxX + 1.6, maxY + 0.75);
  return { minX: Math.max(minX, -W), maxX: Math.min(maxX, W), minY: Math.max(minY, -W), maxY: Math.min(maxY, W) };
}

function sag(vx: number, R: number, y: number) {
  if (!Number.isFinite(R) || Math.abs(R) > 1e9) return vx;
  return vx + R - Math.sign(R) * Math.sqrt(Math.max(0, R * R - y * y));
}

function drawElement(ctx: CanvasRenderingContext2D, e: OpticalElement, cam: Camera, ink: string, muted: string) {
  const X = cam.toX,
    Y = cam.toY,
    S = cam.scale;
  const glass = "rgba(90, 160, 220, 0.18)";
  const glassEdge = "rgba(70, 140, 205, 0.85)";
  ctx.save();
  switch (e.type) {
    case "thinLens": {
      const a = (e.axisAngle * Math.PI) / 180;
      const wx = -Math.sin(a),
        wy = Math.cos(a);
      const h = e.height / 2;
      const p0 = { x: e.position.x - wx * h, y: e.position.y - wy * h },
        p1 = { x: e.position.x + wx * h, y: e.position.y + wy * h };
      ctx.strokeStyle = glassEdge;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(X(p0.x), Y(p0.y));
      ctx.lineTo(X(p1.x), Y(p1.y));
      ctx.stroke();
      // arrowheads: outward = converging, inward = diverging
      const conv = e.focalLength > 0;
      for (const [p, sgn] of [
        [p1, 1],
        [p0, -1],
      ] as const) {
        const dir = conv ? sgn : -sgn;
        ctx.beginPath();
        ctx.moveTo(X(p.x) - 9, Y(p.y) + dir * 9);
        ctx.lineTo(X(p.x), Y(p.y));
        ctx.lineTo(X(p.x) + 9, Y(p.y) + dir * 9);
        ctx.stroke();
      }
      // focal points
      ctx.fillStyle = muted;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      for (const s of [-1, 1]) {
        const fx = e.position.x + Math.cos(a) * e.focalLength * s,
          fy = e.position.y + Math.sin(a) * e.focalLength * s;
        ctx.beginPath();
        ctx.arc(X(fx), Y(fy), 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(s > 0 ? "F" : "F′", X(fx) - 4, Y(fy) + 18);
      }
      break;
    }
    case "planeMirror":
    case "screen": {
      ctx.strokeStyle = e.type === "screen" ? muted : ink;
      ctx.lineWidth = e.type === "screen" ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(X(e.from.x), Y(e.from.y));
      ctx.lineTo(X(e.to.x), Y(e.to.y));
      ctx.stroke();
      break;
    }
    case "sphericalMirror": {
      const f = { x: Math.cos((e.facingAngle * Math.PI) / 180), y: Math.sin((e.facingAngle * Math.PI) / 180) };
      const c = e.concave
        ? { x: e.vertex.x + f.x * e.radius, y: e.vertex.y + f.y * e.radius }
        : { x: e.vertex.x - f.x * e.radius, y: e.vertex.y - f.y * e.radius };
      const mid = Math.atan2(-(e.vertex.y - c.y), e.vertex.x - c.x);
      const half = Math.asin(Math.min(1, e.height / 2 / e.radius));
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(X(c.x), Y(c.y), e.radius * S, mid - half, mid + half);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      for (let k = -6; k <= 6; k++) {
        const a = mid + (half * k) / 6;
        const px = X(c.x) + Math.cos(a) * e.radius * S,
          py = Y(c.y) + Math.sin(a) * e.radius * S;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // focal point
      const F = { x: e.vertex.x + f.x * (e.concave ? 1 : -1) * (e.radius / 2), y: e.vertex.y + f.y * (e.concave ? 1 : -1) * (e.radius / 2) };
      ctx.fillStyle = muted;
      ctx.beginPath();
      ctx.arc(X(F.x), Y(F.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText("F", X(F.x) - 4, Y(F.y) + 18);
      ctx.fillText("C", X(c.x) - 4, Y(c.y) + 18);
      ctx.beginPath();
      ctx.arc(X(c.x), Y(c.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "block": {
      ctx.fillStyle = glass;
      ctx.strokeStyle = glassEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      e.vertices.forEach((v, i) => (i ? ctx.lineTo(X(v.x), Y(v.y)) : ctx.moveTo(X(v.x), Y(v.y))));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = glassEdge;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      const cx = e.vertices.reduce((s, v) => s + v.x, 0) / e.vertices.length,
        cy = e.vertices.reduce((s, v) => s + v.y, 0) / e.vertices.length;
      ctx.fillText(`n = ${e.refractiveIndex}`, X(cx) - 22, Y(cy) + 40);
      break;
    }
    case "semicircle": {
      const a = (e.flatNormalAngle * Math.PI) / 180;
      ctx.fillStyle = glass;
      ctx.strokeStyle = glassEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // canvas y is flipped: angle a in world → −a on screen
      ctx.arc(X(e.center.x), Y(e.center.y), e.radius * S, -a + Math.PI / 2, -a + (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = glassEdge;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText(`n = ${e.refractiveIndex}`, X(e.center.x - e.radius * 0.6), Y(e.center.y - e.radius * 0.5));
      break;
    }
    case "sphericalLens": {
      const hEdge = Math.min(e.height / 2, Math.abs(e.r1) * 0.999, Math.abs(e.r2) * 0.999);
      const v1 = e.position.x - e.thickness / 2,
        v2 = e.position.x + e.thickness / 2;
      ctx.fillStyle = glass;
      ctx.strokeStyle = glassEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const N = 40;
      for (let k = 0; k <= N; k++) {
        const y = -hEdge + (2 * hEdge * k) / N;
        const x = sag(v1, e.r1, y);
        if (k) ctx.lineTo(X(x), Y(e.position.y + y));
        else ctx.moveTo(X(x), Y(e.position.y + y));
      }
      for (let k = N; k >= 0; k--) {
        const y = -hEdge + (2 * hEdge * k) / N;
        ctx.lineTo(X(sag(v2, e.r2, y)), Y(e.position.y + y));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export interface OpticsDrawOpts {
  /** 0..1 reveal progress of the light (for the propagation animation) */
  reveal: number;
  verification?: Verification | null;
}

export function drawOptics(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene, out: OpticsResult | null, o: OpticsDrawOpts): Camera {
  const op = scene.optics!;
  const cam = fitCamera(opticsBounds(scene, out), w, h, 24);
  const X = cam.toX,
    Y = cam.toY;
  const ink = cssVar("--ink"),
    muted = cssVar("--muted");
  const dark = getComputedStyle(document.documentElement).colorScheme === "dark";

  // optical axis
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = muted;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, Y(0));
  ctx.lineTo(w, Y(0));
  ctx.stroke();
  ctx.restore();

  for (const e of op.elements) drawElement(ctx, e, cam, ink, muted);

  // rays with a soft glow; progressive reveal by path length
  if (out) {
    const lengths = out.rays.map((r) => r.points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - r.points[i].x, p.y - r.points[i].y), 0));
    const maxLen = Math.max(...lengths, 1e-9);
    const budget = o.reveal * maxLen;
    out.rays.forEach((ray) => {
      let left = budget;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let k = 1; k < ray.points.length && left > 0; k++) {
        const a = ray.points[k - 1],
          b = ray.points[k];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        const u = Math.min(1, left / seg);
        left -= seg;
        const ex = a.x + (b.x - a.x) * u,
          ey = a.y + (b.y - a.y) * u;
        const I = ray.intensity[k - 1] ?? 1;
        ctx.strokeStyle = ray.color;
        ctx.globalAlpha = (dark ? 0.25 : 0.18) * I;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(X(a.x), Y(a.y));
        ctx.lineTo(X(ex), Y(ey));
        ctx.stroke();
        ctx.globalAlpha = 0.95 * Math.max(0.25, I);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X(a.x), Y(a.y));
        ctx.lineTo(X(ex), Y(ey));
        ctx.stroke();
      }
      ctx.restore();
    });

    // first refraction: draw the normal and angle labels
    // annotate the most instructive interface: a TIR if there is one, else the most oblique refraction
    const ev =
      out.events.find((e) => e.kind === "tir") ??
      out.events.filter((e) => e.kind === "refraction" && (e.thetaIn ?? 0) > 0.5).sort((a, b) => (b.thetaIn ?? 0) - (a.thetaIn ?? 0))[0];
    if (ev && o.reveal >= 1 && ev.thetaIn !== undefined && ev.normal) {
      const n = ev.normal,
        nl = 0.8;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = muted;
      ctx.beginPath();
      ctx.moveTo(X(ev.point.x - n.x * nl), Y(ev.point.y - n.y * nl));
      ctx.lineTo(X(ev.point.x + n.x * nl), Y(ev.point.y + n.y * nl));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "600 12px 'IBM Plex Mono', monospace";
      ctx.fillStyle = ink;
      // label θ₁ on the incoming side of the normal, θ₂ on the far side
      ctx.fillText(`θ₁ = ${ev.thetaIn.toFixed(1)}°`, X(ev.point.x + n.x * 0.5) - 40, Y(ev.point.y + n.y * 0.5) - 8);
      if (ev.kind === "refraction" && ev.thetaOut !== undefined)
        ctx.fillText(`θ₂ = ${ev.thetaOut.toFixed(1)}°`, X(ev.point.x - n.x * 0.5) + 6, Y(ev.point.y - n.y * 0.5) + 16);
      if (ev.kind === "tir") {
        ctx.fillStyle = cssVar("--signal");
        ctx.fillText("total internal reflection", X(ev.point.x) + 12, Y(ev.point.y) - 14);
      }
      ctx.restore();
    }
  }

  // image point for lens scenes, plus virtual-ray extensions
  const lens = op.elements.find((e) => e.type === "thinLens");
  const di = o.verification?.quantities.find((q) => q.id === "di");
  if (lens && lens.type === "thinLens" && di && out && o.reveal >= 1 && Number.isFinite(di.simulated)) {
    const m = o.verification?.quantities.find((q) => q.id === "m");
    const src = op.sources[0];
    const hObj = src.origin.y - lens.position.y;
    const ix = lens.position.x + di.simulated,
      iy = lens.position.y + (m ? m.simulated * hObj : 0);
    ctx.save();
    if (di.simulated < 0) {
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = cssVar("--signal");
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.3;
      for (const ray of out.rays) {
        if (ray.points.length < 2) continue;
        const p = ray.points[1];
        ctx.beginPath();
        ctx.moveTo(X(p.x), Y(p.y));
        ctx.lineTo(X(ix), Y(iy));
        ctx.stroke();
      }
    }
    ctx.restore();
    // object and image arrows
    const arrowUp = (x: number, y0: number, y1: number, color: string, label: string, dashed: boolean) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      if (dashed) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y0));
      ctx.lineTo(X(x), Y(y1));
      ctx.stroke();
      ctx.setLineDash([]);
      const dir = y1 > y0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y1));
      ctx.lineTo(X(x) - 6, Y(y1) + dir * 10);
      ctx.lineTo(X(x) + 6, Y(y1) + dir * 10);
      ctx.closePath();
      ctx.fill();
      ctx.font = "600 12px 'IBM Plex Sans', sans-serif";
      ctx.fillText(label, X(x) + 8, Y(y1) + (dir > 0 ? 4 : 14));
      ctx.restore();
    };
    arrowUp(src.origin.x, lens.position.y, src.origin.y, ink, "object", false);
    arrowUp(ix, lens.position.y, iy, cssVar("--signal"), di.simulated > 0 ? "real image" : "virtual image", di.simulated < 0);
  }
  return cam;
}
