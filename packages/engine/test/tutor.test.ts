import { describe, expect, it } from "vitest";
import { classifyChange, experimentsFor, feedback } from "../src/tutor/experiments";
import { EXAMPLES, exampleScene } from "../src/examples";
import { applyParam, paramValue } from "../src/params";
import { runScene } from "../src/run";

describe("offline Socratic tutor", () => {
  it("classifies measured changes", () => {
    expect(classifyChange(2, 4)).toBe("double");
    expect(classifyChange(2, 3)).toBe("up");
    expect(classifyChange(2, 2.01)).toBe("same");
    expect(classifyChange(2, 1.5)).toBe("down");
    expect(classifyChange(2, 0.9)).toBe("halve");
    expect(classifyChange(1, 5)).toBe("more2");
  });
  it("every experiment runs and produces its observed quantity", () => {
    for (const ex of EXAMPLES) {
      const scene = exampleScene(ex.id);
      for (const e of experimentsFor(scene)) {
        const before = runScene(scene).verification.quantities.find((q) => q.id === e.quantityId);
        expect(before, `${ex.id}/${e.id}`).toBeDefined();
        const next = applyParam(scene, e.paramId, e.change(paramValue(scene, e.paramId)!));
        const after = runScene(next).verification.quantities.find((q) => q.id === e.quantityId);
        expect(after, `${ex.id}/${e.id} after`).toBeDefined();
      }
    }
  });
  it("the pendulum mass experiment is graded 'same' by the simulation", () => {
    const s = exampleScene("pendulum");
    const e = experimentsFor(s).find((x) => x.paramId === "m")!;
    const T0 = runScene(s).verification.quantities.find((q) => q.id === "T")!.simulated;
    const T1 = runScene(applyParam(s, "m", e.change(1))).verification.quantities.find((q) => q.id === "T")!.simulated;
    expect(classifyChange(T0, T1)).toBe("same");
    expect(feedback("same", "same", T0, T1, "period", "s")).toMatch(/matches/);
  });
});
