import { useEffect, useRef } from "react";

/** A crisp, DPR-aware canvas that redraws on resize and whenever `deps` change. */
export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const render = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.round(r.width * dpr)),
        h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      drawRef.current(ctx, r.width, r.height);
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Read a CSS custom property (theme-aware colours for canvas drawing). */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || "#888";
}

/** World (metres, y-up) ↔ screen (px, y-down) mapping that fits a bounding box. */
export interface Camera {
  scale: number;
  ox: number;
  oy: number;
  toX: (x: number) => number;
  toY: (y: number) => number;
  fromX: (px: number) => number;
  fromY: (py: number) => number;
}

export function fitCamera(b: { minX: number; maxX: number; minY: number; maxY: number }, w: number, h: number, pad = 28): Camera {
  const bw = Math.max(1e-6, b.maxX - b.minX),
    bh = Math.max(1e-6, b.maxY - b.minY);
  const scale = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = (w - bw * scale) / 2 - b.minX * scale;
  const oy = (h + bh * scale) / 2 + b.minY * scale;
  return {
    scale,
    ox,
    oy,
    toX: (x) => ox + x * scale,
    toY: (y) => oy - y * scale,
    fromX: (px) => (px - ox) / scale,
    fromY: (py) => (oy - py) / scale,
  };
}
