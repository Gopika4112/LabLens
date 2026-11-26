import { useMemo, useRef, useState } from "react";
import { fmt } from "@lablens/engine";
import { cssVar, useCanvas } from "../lib/useCanvas";
import { sonify, type SonifyHandle } from "../lib/sonify";
import type { PlotSpec } from "../lib/series";
import { Icon } from "./Icon";

function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function Plot({
  spec,
  cursorX,
  onSeek,
  height = 180,
  className = "",
  ghost,
}: {
  spec: PlotSpec;
  /** a pinned earlier run, drawn dashed underneath for comparison */
  ghost?: PlotSpec;
  cursorX?: number;
  onSeek?: (x: number) => void;
  height?: number;
  className?: string;
}) {
  const [listenU, setListenU] = useState(-1);
  const [listenIdx, setListenIdx] = useState(spec.listenIndex);
  const handle = useRef<SonifyHandle | null>(null);
  const tx = (x: number) => (spec.logX ? Math.log10(x) : x);
  const bounds = useMemo(() => {
    const all = ghost && !!ghost.logX === !!spec.logX ? [...spec.series, ...ghost.series] : spec.series;
    const xs = all.flatMap((s) => s.xs).map(tx);
    const ys = all.flatMap((s) => s.ys).filter(Number.isFinite);
    let y0 = Math.min(0, ...ys),
      y1 = Math.max(...ys);
    if (y1 - y0 < 1e-12) {
      y0 -= 1;
      y1 += 1;
    }
    const pad = (y1 - y0) * 0.08;
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: y0 - (y0 < 0 ? pad : 0), y1: y1 + pad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, ghost]);

  const L = 52,
    R = 12,
    T = 10,
    B = 30;
  const ref = useCanvas(
    (ctx, w, h) => {
      const px = (x: number) => L + ((tx(x) - bounds.x0) / (bounds.x1 - bounds.x0 || 1)) * (w - L - R);
      const py = (y: number) => T + (1 - (y - bounds.y0) / (bounds.y1 - bounds.y0)) * (h - T - B);
      const muted = cssVar("--muted"),
        line = cssVar("--line");
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = muted;
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (const v of niceTicks(bounds.y0, bounds.y1, 4)) {
        ctx.beginPath();
        ctx.moveTo(L, py(v));
        ctx.lineTo(w - R, py(v));
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(fmt(v), L - 6, py(v) + 4);
      }
      const xt = spec.logX ? niceTicks(bounds.x0, bounds.x1, 4).map((v) => 10 ** v) : niceTicks(bounds.x0, bounds.x1, 5);
      ctx.textAlign = "center";
      for (const v of xt) ctx.fillText(spec.logX ? fmt(v) : fmt(v), px(v), h - B + 16);
      ctx.fillText(spec.xLabel, (L + w - R) / 2, h - 2);
      if (bounds.y0 < 0 && bounds.y1 > 0) {
        ctx.strokeStyle = muted;
        ctx.beginPath();
        ctx.moveTo(L, py(0));
        ctx.lineTo(w - R, py(0));
        ctx.stroke();
      }
      const trace = (s: { xs: number[]; ys: number[] }) => {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < s.xs.length; i++) {
          if (!Number.isFinite(s.ys[i])) continue;
          const X = px(s.xs[i]),
            Y = py(s.ys[i]);
          if (!started) {
            ctx.moveTo(X, Y);
            started = true;
          } else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      };
      if (ghost) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.75;
        for (const g of ghost.series) {
          ctx.strokeStyle = cssVar(g.colorVar);
          trace(g);
        }
        ctx.restore();
      }
      spec.series.forEach((s, si) => {
        ctx.strokeStyle = cssVar(s.colorVar);
        ctx.lineWidth = si === listenIdx && listenU >= 0 ? 3 : 2;
        trace(s);
      });
      const cx = listenU >= 0 ? L + listenU * (w - L - R) : cursorX !== undefined ? px(cursorX) : null;
      if (cx !== null) {
        ctx.strokeStyle = cssVar("--signal");
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, T);
        ctx.lineTo(cx, h - B);
        ctx.stroke();
      }
    },
    [spec, ghost, bounds, cursorX, listenU, listenIdx],
  );

  const listen = () => {
    if (handle.current) {
      handle.current.stop();
      handle.current = null;
      return;
    }
    const s = spec.series[listenIdx];
    handle.current = sonify(s.ys, { onProgress: setListenU });
    void handle.current.done.then(() => {
      handle.current = null;
      setListenU(-1);
    });
  };

  /** every sample, not the 16-row preview: for spreadsheets and lab reports */
  const downloadCsv = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const head = [spec.xLabel, ...spec.series.map((s) => (s.unit ? `${s.label} (${s.unit})` : s.label))].map(esc).join(",");
    const n = Math.max(...spec.series.map((s) => s.xs.length));
    const rows: string[] = [head];
    for (let i = 0; i < n; i++) {
      const x = spec.series[0].xs[i];
      rows.push([x, ...spec.series.map((s) => s.ys[i])].map((v) => (v === undefined || !Number.isFinite(v) ? "" : String(+v.toPrecision(10)))).join(","));
    }
    const url = URL.createObjectURL(new Blob([rows.join("\n") + "\n"], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lablens-${spec.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const summary = spec.series
    .map((s) => {
      const f = s.ys.filter(Number.isFinite);
      return `${s.label}: from ${fmt(f[0], s.unit)} to ${fmt(f[f.length - 1], s.unit)}, min ${fmt(Math.min(...f), s.unit)}, max ${fmt(Math.max(...f), s.unit)}`;
    })
    .join(". ");

  return (
    <figure className={`card p-3 m-0 flex flex-col gap-2 ${className}`}>
      <figcaption className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-display text-lg">{spec.title}</span>
        <span className="flex items-center gap-2">
          {spec.series.length > 1 && (
            <label className="text-xs text-muted flex items-center gap-1">
              <span className="sr-only">Series to listen to</span>
              <select className="field !py-1 !px-2 text-xs w-auto" value={listenIdx} onChange={(e) => setListenIdx(Number(e.target.value))}>
                {spec.series.map((s, i) => (
                  <option key={s.label} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="btn !min-h-9 !px-3 text-sm"
            onClick={listen}
            aria-pressed={listenU >= 0}
            title="Play this graph as sound: pitch = value, left→right = time, click = crosses zero"
          >
            <Icon name={listenU >= 0 ? "stop" : "sound"} size={16} /> {listenU >= 0 ? "Stop" : "Listen"}
          </button>
        </span>
      </figcaption>
      <canvas
        ref={ref}
        style={{ width: "100%", height }}
        role="img"
        aria-label={`${spec.title} graph. ${summary}`}
        onPointerDown={(e) => {
          if (!onSeek) return;
          const r = e.currentTarget.getBoundingClientRect();
          const u = (e.clientX - r.left - L) / (r.width - L - R);
          const x = bounds.x0 + u * (bounds.x1 - bounds.x0);
          onSeek(spec.logX ? 10 ** x : x);
        }}
      />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {spec.series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-muted">
            <span aria-hidden className="inline-block w-3 h-1 rounded" style={{ background: `var(${s.colorVar})` }} />
            {s.label}
          </span>
        ))}
        {ghost && (
          <span className="flex items-center gap-1.5 text-muted">
            <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-muted" />
            pinned run
          </span>
        )}
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Data table</summary>
        <button className="btn btn-ghost !min-h-8 !px-2 text-xs !font-medium mt-1 -ml-2" onClick={downloadCsv}>
          <Icon name="download" size={14} /> Download all {spec.series[0].xs.length} samples (CSV)
        </button>
        <div className="overflow-x-auto max-h-48">
          <table className="num w-full text-left">
            <caption className="sr-only">{spec.title} sampled values</caption>
            <thead>
              <tr>
                <th scope="col" className="pr-3">
                  {spec.xLabel}
                </th>
                {spec.series.map((s) => (
                  <th scope="col" key={s.label} className="pr-3">
                    {s.label} {s.unit && `(${s.unit})`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 16 }, (_, k) => Math.round((k * (spec.series[0].xs.length - 1)) / 15)).map((i) => (
                <tr key={i}>
                  <td className="pr-3">{fmt(spec.series[0].xs[i])}</td>
                  {spec.series.map((s) => (
                    <td key={s.label} className="pr-3">
                      {fmt(s.ys[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
