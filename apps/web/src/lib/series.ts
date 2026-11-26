import type { Scene, SimOutput } from "@lablens/engine";

export interface Series {
  label: string;
  unit: string;
  colorVar: string;
  xs: number[];
  ys: number[];
}

export interface PlotSpec {
  id: string;
  title: string;
  xLabel: string;
  yLabel: string;
  logX?: boolean;
  series: Series[];
  /** what "Listen" plays */
  listenIndex: number;
}

const PALETTE = ["--f-gravity", "--f-friction", "--f-tension", "--f-normal", "--f-spring", "--f-applied"];

/** Principal direction of a body's motion (PCA of its positions) so velocity has a meaningful sign. */
function principalDir(xs: number[], ys: number[]): { x: number; y: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n,
    my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx + syy < 1e-12) return { x: 1, y: 0 };
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let d = { x: Math.cos(theta), y: Math.sin(theta) };
  // orient so that the initial motion is positive
  const k = Math.min(n - 1, 3);
  if ((xs[k] - xs[0]) * d.x + (ys[k] - ys[0]) * d.y < 0) d = { x: -d.x, y: -d.y };
  return d;
}

export function plotsFor(scene: Scene, out: SimOutput): PlotSpec[] {
  if (out.domain === "mechanics") {
    const fr = out.result.frames;
    const t = fr.map((f) => f.t);
    const bodies = scene.mechanics!.bodies;
    const vel: Series[] = bodies.map((b, i) => {
      const d = principalDir(
        fr.map((f) => f.bodies[i].x),
        fr.map((f) => f.bodies[i].y),
      );
      return {
        label: `${b.label ?? b.id} velocity`,
        unit: "m/s",
        colorVar: PALETTE[i % PALETTE.length],
        xs: t,
        ys: fr.map((f) => f.bodies[i].vx * d.x + f.bodies[i].vy * d.y),
      };
    });
    const plots: PlotSpec[] = [{ id: "velocity", title: "Velocity", xLabel: "time (s)", yLabel: "m/s", series: vel, listenIndex: 0 }];
    plots.push({
      id: "energy",
      title: "Energy",
      xLabel: "time (s)",
      yLabel: "J",
      listenIndex: 0,
      series: [
        { label: "Kinetic", unit: "J", colorVar: "--f-friction", xs: t, ys: fr.map((f) => f.energy.kinetic) },
        { label: "Potential", unit: "J", colorVar: "--f-gravity", xs: t, ys: fr.map((f) => f.energy.potential - fr[0].energy.potential) },
        { label: "Lost to friction/drag", unit: "J", colorVar: "--f-drag", xs: t, ys: fr.map((f) => f.energy.dissipated) },
      ],
    });
    if (scene.mechanics!.ropes.length || scene.mechanics!.links.length)
      plots.push({
        id: "tension",
        title: "Tension",
        xLabel: "time (s)",
        yLabel: "N",
        listenIndex: 0,
        series: [
          ...scene.mechanics!.ropes.map((r, k) => ({
            label: `Tension (${r.id})`,
            unit: "N",
            colorVar: "--f-tension",
            xs: t,
            ys: fr.map((f) => f.ropeTension[k]),
          })),
          ...scene.mechanics!.links.map((_l, k) => ({
            label: `String tension`,
            unit: "N",
            colorVar: "--f-tension",
            xs: t,
            ys: fr.map((f) => f.linkTension[k]),
          })),
        ],
      });
    return plots;
  }
  if (out.domain === "circuits") {
    const fr = out.result.frames;
    const t = fr.map((f) => f.t);
    const comps = scene.circuit!.components;
    const shown = comps.map((c, k) => ({ c, k })).filter(({ c }) => c.type !== "switch" && c.type !== "voltageSource");
    const plots: PlotSpec[] = [
      {
        id: "voltage",
        title: "Voltage across components",
        xLabel: "time (s)",
        yLabel: "V",
        listenIndex: Math.max(
          0,
          shown.findIndex(({ c }) => c.type === "capacitor"),
        ),
        series: shown.map(({ c, k }, i) => ({
          label: c.label ?? c.id,
          unit: "V",
          colorVar: PALETTE[i % PALETTE.length],
          xs: t,
          ys: fr.map((f) => Math.abs(f.compV[k]) * Math.sign(f.compV[k] || 1)),
        })),
      },
      {
        id: "current",
        title: "Current",
        xLabel: "time (s)",
        yLabel: "A",
        listenIndex: 0,
        series: shown
          .slice(0, 4)
          .map(({ c, k }, i) => ({ label: c.label ?? c.id, unit: "A", colorVar: PALETTE[i % PALETTE.length], xs: t, ys: fr.map((f) => f.compI[k]) })),
      },
    ];
    if (out.sweep)
      plots.push({
        id: "bode",
        title: "Frequency response",
        xLabel: "frequency (Hz)",
        yLabel: "gain",
        logX: true,
        listenIndex: 0,
        series: [{ label: "|V_R / V_in|", unit: "", colorVar: "--f-tension", xs: out.sweep.f, ys: out.sweep.mag }],
      });
    return plots;
  }
  return [];
}

/** Map a time to the nearest frame index (frames may be non-uniform). */
export function frameAt(times: number[], t: number): number {
  let lo = 0,
    hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return t - times[lo] < times[hi] - t ? lo : hi;
}
