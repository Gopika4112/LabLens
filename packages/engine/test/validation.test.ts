import { describe, expect, it } from "vitest";
import { VALIDATION_CASES, runCase } from "../src/validation/cases";

describe("Engine Accuracy suite (closed-form validation)", () => {
  for (const c of VALIDATION_CASES) {
    it(`${c.domain} · ${c.name} (≤ ${c.tolerancePct}%)`, () => {
      const o = runCase(c);
      expect(o.error).toBeUndefined();
      expect(Number.isFinite(o.result!.errorPct)).toBe(true);
      expect(o.result!.errorPct).toBeLessThanOrEqual(c.tolerancePct);
    });
  }
});
