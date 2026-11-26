/** One entry point: Scene → simulation result + verification, for any domain. */
import type { Scene } from "./schema/scene";
import { simulateMechanics, type MechResult } from "./mechanics/engine";
import { simulateCircuit, acSweep, type CircuitResult } from "./circuits/mna";
import { traceOptics, type OpticsResult } from "./optics/tracer";
import { analyzeMechanics } from "./analytic/mechanics";
import { analyzeCircuit } from "./analytic/circuits";
import { analyzeOptics } from "./analytic/optics";
import type { Verification } from "./analytic/types";

export type SimOutput =
  | { domain: "mechanics"; result: MechResult; verification: Verification }
  | { domain: "circuits"; result: CircuitResult; sweep: ReturnType<typeof acSweep>; verification: Verification }
  | { domain: "optics"; result: OpticsResult; verification: Verification };

export function runScene(scene: Scene): SimOutput {
  switch (scene.domain) {
    case "mechanics": {
      const result = simulateMechanics(scene.mechanics!, { duration: scene.duration });
      return { domain: "mechanics", result, verification: analyzeMechanics(scene.mechanics!, result) };
    }
    case "circuits": {
      const result = simulateCircuit(scene.circuit!, scene.duration);
      return { domain: "circuits", result, sweep: acSweep(scene.circuit!), verification: analyzeCircuit(scene.circuit!, result) };
    }
    case "optics": {
      const result = traceOptics(scene.optics!);
      return { domain: "optics", result, verification: analyzeOptics(scene.optics!, result) };
    }
  }
}
