import { useEffect, useRef, useState } from "react";
import { fmt, fmtPct, VALIDATION_CASES } from "@lablens/engine";
import { runBenchmarks, type BenchRow } from "../lib/worker";
import { Icon } from "../components/Icon";

/** Runs the exact validation suite that gates CI — live, in this browser. */
export function Accuracy() {
  const [rows, setRows] = useState<BenchRow[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const runId = useRef(0);
  const run = () => {
    const id = ++runId.current; // rows from a superseded run are ignored
    setRows([]);
    setRunning(true);
    setElapsed(null);
    const t0 = performance.now();
    void runBenchmarks((r) => id === runId.current && setRows((rs) => [...rs, r])).then(() => {
      if (id !== runId.current) return;
      setRunning(false);
      setElapsed(performance.now() - t0);
    });
  };
  useEffect(() => {
    run();
  }, []);
  const passed = rows.filter((r) => r.pass).length;
  const total = VALIDATION_CASES.length;
  const failed = rows.length - passed;
  const worst = rows.filter((r) => r.domain !== "numerics" && r.errorPct !== undefined).reduce((m, r) => Math.max(m, r.errorPct!), 0);
  return (
    <div className="grid gap-6">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl">Engine accuracy</h1>
        <p className="text-muted mt-2">
          Every case compares a quantity measured from a LabLens simulation with an independent closed-form textbook result. This page runs the same suite that
          our continuous-integration tests run — right now, on your device. Nothing here is pre-computed.
        </p>
      </div>
      <div className="instrument p-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-4" aria-live="polite">
          <div>
            <p className="text-sm opacity-75">{running ? "Cases checked" : "Cases passed"}</p>
            <p className="num text-3xl text-phosphor">
              {running ? rows.length : passed} <span className="text-xl opacity-70">/ {total}</span>
            </p>
            {!running && failed > 0 && <p className="text-sm text-[#f87171]">{failed} failed</p>}
          </div>
          <div>
            <p className="text-sm opacity-75">Worst physics error</p>
            <p className="num text-3xl">{rows.length ? fmtPct(worst) : "—"}</p>
          </div>
          <div>
            <p className="text-sm opacity-75">Total time</p>
            <p className="num text-3xl">{elapsed ? fmt(elapsed / 1000, "s") : running ? "running" : "—"}</p>
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary w-full" onClick={run} disabled={running}>
              {running ? (
                "Running…"
              ) : (
                <>
                  <Icon name="restart" size={17} /> Run again
                </>
              )}
            </button>
          </div>
        </div>
        <div
          className="h-1.5 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-label="Validation progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={rows.length}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-out ${!running && failed > 0 ? "bg-[#f87171]" : "bg-[#4ade80]"}`}
            style={{ width: `${(rows.length / total) * 100}%` }}
          />
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Validation cases: analytic value, simulated value, error and tolerance</caption>
          <thead className="text-left text-muted border-b border-line">
            <tr>
              <th scope="col" className="p-3">
                Case
              </th>
              <th scope="col" className="p-3">
                Theory
              </th>
              <th scope="col" className="p-3">
                Simulation
              </th>
              <th scope="col" className="p-3">
                Error
              </th>
              <th scope="col" className="p-3">
                Tolerance
              </th>
              <th scope="col" className="p-3">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 align-top">
                <td className="p-3">
                  <span className="chip mr-2">{r.domain}</span>
                  {r.name}
                  {r.formula && <div className="num text-xs text-muted mt-1">{r.formula}</div>}
                </td>
                <td className="p-3 num whitespace-nowrap">{r.analytic !== undefined ? `${+r.analytic.toPrecision(7)} ${r.unit}` : "—"}</td>
                <td className="p-3 num whitespace-nowrap">{r.simulated !== undefined ? +r.simulated.toPrecision(7) : r.error}</td>
                <td className="p-3 num whitespace-nowrap">{r.errorPct !== undefined ? fmtPct(r.errorPct) : "—"}</td>
                <td className="p-3 num whitespace-nowrap text-muted">≤ {fmtPct(r.tolerancePct)}</td>
                <td className={`p-3 font-semibold ${r.pass ? "text-ok" : "text-bad"}`}>
                  <span className="inline-flex items-center gap-1">
                    <Icon name={r.pass ? "check" : "x"} size={15} />
                    {r.pass ? "pass" : "fail"}
                  </span>
                </td>
              </tr>
            ))}
            {running &&
              Array.from({ length: Math.min(4, total - rows.length) }, (_, k) => (
                <tr key={`pending-${k}`} className="border-b border-line/60" aria-hidden>
                  {[52, 18, 18, 10, 10, 8].map((wpct, c) => (
                    <td key={c} className="p-3">
                      <span className="block h-3.5 rounded bg-line/70 animate-pulse" style={{ width: `${wpct * 1.6}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted max-w-3xl">
        Convergence-order rows measure the global error of each integrator at Δt and Δt/2 on an undamped oscillator; the expected orders are 4 (RK4), 2
        (velocity Verlet) and 1 (semi-implicit Euler). The pendulum rows use the exact large-amplitude period via the complete elliptic integral K(k), computed
        with the arithmetic–geometric mean.
      </p>
    </div>
  );
}
