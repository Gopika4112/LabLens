import type { WorkerRequest, WorkerResponse, BenchRow } from "../worker/sim.worker";
import type { Scene, SimOutput } from "@lablens/engine";

type Listener = (m: WorkerResponse) => void;

let worker: Worker | null = null;
const listeners = new Map<number, Listener>();
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../worker/sim.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => listeners.get(ev.data.id)?.(ev.data);
  }
  return worker;
}

export function simulate(scene: Scene): Promise<{ output: SimOutput; ms: number }> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    listeners.set(id, (m) => {
      if (m.kind !== "run") return;
      listeners.delete(id);
      if (m.ok) resolve({ output: m.output, ms: m.ms });
      else reject(new Error(m.error));
    });
    const req: WorkerRequest = { id, kind: "run", scene };
    getWorker().postMessage(req);
  });
}

export function runBenchmarks(onRow: (r: BenchRow) => void): Promise<void> {
  return new Promise((resolve) => {
    const id = nextId++;
    listeners.set(id, (m) => {
      if (m.kind === "case") onRow(m.row);
      if (m.kind === "done") {
        listeners.delete(id);
        resolve();
      }
    });
    const req: WorkerRequest = { id, kind: "bench" };
    getWorker().postMessage(req);
  });
}

export type { BenchRow };
