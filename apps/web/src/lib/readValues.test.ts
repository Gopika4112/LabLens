import { describe, expect, it } from "vitest";
import { readValues } from "./readValues";

const args = { m1: 2, m2: 3, angle: 30, muS: 0.25, muK: 0.2 };
const has = (list: string[], s: string) => list.some((x) => x.startsWith(s));

describe("readValues", () => {
  it("drops an arg the model says it assumed, keeping one it only mentions", () => {
    // real gemini-3.5-flash-lite notes for the sample sketch
    for (const note of [
      "Static friction coefficient muS assumed to be 0.25 given kinetic friction muK = 0.2",
      "muS not explicitly given; assumed muS = 1.25 * muK = 0.25",
      "μs not given; assumed equal to μk = 0.2",
    ]) {
      const r = readValues("inclinePulley", args, [note]);
      expect(has(r, "static friction"), note).toBe(false);
      expect(has(r, "kinetic friction"), note).toBe(true);
      expect(r).toHaveLength(4);
    }
  });
  it("keeps everything when there are no notes", () => {
    expect(readValues("inclinePulley", args, [])).toHaveLength(5);
  });
});
