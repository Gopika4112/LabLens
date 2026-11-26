import { describe, expect, it } from "vitest";
import { describeScene, describeMoment } from "../src/describe";
import { exampleScene } from "../src/examples";
import { runScene } from "../src/run";
import { fmt, fmtPct } from "../src/format";

describe("screen-reader descriptions", () => {
  it("describes an incline + pulley scene in words", () => {
    const d = describeScene(exampleScene("incline-pulley"));
    expect(d).toContain("2 kg block");
    expect(d).toContain("30° incline");
    expect(d).toContain("over a pulley");
  });
  it("describes circuits component by component", () => {
    const d = describeScene(exampleScene("rc-charge"));
    expect(d).toContain("1 kΩ resistor");
    expect(d).toContain("1 mF capacitor");
  });
  it("describes a moment of the simulation", () => {
    const s = exampleScene("atwood");
    expect(describeMoment(s, runScene(s), 30)).toMatch(/rope tension 23\.5 N/);
  });
  it("formats engineering units", () => {
    expect(fmt(4700, "Ω")).toBe("4.7 kΩ");
    expect(fmt(0.00022, "F")).toBe("220 µF");
    expect(fmt(9.81, "m/s²")).toBe("9.81 m/s²");
    expect(fmtPct(0.00012)).toBe("1.2e-4%");
  });
});
