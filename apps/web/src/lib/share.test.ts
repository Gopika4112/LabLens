import { describe, expect, it } from "vitest";
import { applyParam, exampleScene, paramValue } from "@lablens/engine";
import { decodeScene, encodeScene } from "./share";

describe("share links", () => {
  it("round-trips a scene, including changed slider values", async () => {
    const scene = applyParam(exampleScene("atwood"), "m2", 4.5);
    const code = await encodeScene(scene);
    expect(code.startsWith("~")).toBe(true);
    expect(code).toMatch(/^~[A-Za-z0-9_-]+$/); // URL-safe, no padding
    const back = await decodeScene(code);
    expect(back.title).toBe(scene.title);
    expect(paramValue(back, "m2")).toBe(4.5);
  });
  it("rejects a damaged link with a readable message", async () => {
    await expect(decodeScene("~notreal123")).rejects.toThrow(/damaged/);
  });
});
