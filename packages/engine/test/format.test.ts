import { describe, expect, it } from "vitest";
import { fmt } from "../src/format";

describe("fmt", () => {
  it("shows floating-point noise as zero", () => {
    expect(fmt(-7.692e-16, "m/s²", 4)).toBe("0 m/s²");
  });
  it("keeps small real values and engineering units", () => {
    expect(fmt(2.5e-4, "m")).toBe("2.50e-4 m");
    expect(fmt(1e-5, "F")).toBe("10 µF");
    expect(fmt(3.244, "m/s²", 4)).toBe("3.244 m/s²");
  });
});
