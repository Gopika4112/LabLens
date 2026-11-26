/// <reference lib="webworker" />
/**
 * All physics runs here, off the main thread, so the UI stays at 60 fps.
 * Protocol: { id, kind: "run", scene } → { id, ok, output | error }
 *           { id, kind: "bench" }      → streamed { id, kind: "case", outcome } … then { id, done }
 */
import { runScene, validateScene, VALIDATION_CASES, runCase, type SimOutput } from "@lablens/engine";

export type WorkerRequest = { id: number; kind: "run"; scene: unknown } | { id: number; kind: "bench" };

export type BenchRow = {
  id: string;
  domain: string;
  name: string;
  tolerancePct: number;
  pass: boolean;
  ms: number;
  error?: string;
  analytic?: number;
  simulated?: number;
  unit?: string;
  errorPct?: number;
  formula?: string;
};

export type WorkerResponse =
  | { id: number; kind: "run"; ok: true; output: SimOutput; ms: number }
  | { id: number; kind: "run"; ok: false; error: string }
  | { id: number; kind: "case"; row: BenchRow }
  | { id: number; kind: "done" };

const post = (m: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.kind === "run") {
    const t0 = performance.now();
    try {
      const v = validateScene(msg.scene);
      if (!v.ok) throw new Error(v.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
      const output = runScene(v.scene);
      post({ id: msg.id, kind: "run", ok: true, output, ms: performance.now() - t0 });
    } catch (e) {
      post({ id: msg.id, kind: "run", ok: false, error: (e as Error).message });
    }
    return;
  }
  for (const c of VALIDATION_CASES) {
    const o = runCase(c);
    post({
      id: msg.id,
      kind: "case",
      row: { id: c.id, domain: c.domain, name: c.name, tolerancePct: c.tolerancePct, pass: o.pass, ms: o.ms, error: o.error, ...(o.result ?? {}) },
    });
  }
  post({ id: msg.id, kind: "done" });
};
