import { describe, expect, it } from "vitest";
import { extractJson, plainText } from "./_lib/http";

describe("extractJson (free-model replies)", () => {
  it("survives an extra closing brace and a stray reasoning tag", () => {
    // a real gemini-3.5-flash-lite tutor reply, shortened
    const raw = '{"reply":"What will happen?","prediction":{"question":"Q?","choices":["a","b"]}}}</thought>\n';
    expect(extractJson(raw)).toEqual({ reply: "What will happen?", prediction: { question: "Q?", choices: ["a", "b"] } });
  });
  it("reads fenced JSON after prose, and braces inside strings", () => {
    expect(extractJson('Sure!\n```json\n{"a":"x } y","b":{"c":1}}\n```')).toEqual({ a: "x } y", b: { c: 1 } });
  });
  it("skips a <think> block that contains braces", () => {
    expect(extractJson('<think>maybe {"a":0}</think>{"a":1}')).toEqual({ a: 1 });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("plainText", () => {
  it("turns inline LaTeX into readable text", () => {
    expect(plainText("the block ($m_1$) is 2 kg and $\\mu_k = 0.2$")).toBe("the block (m1) is 2 kg and μk = 0.2");
  });
  it("drops markdown bold", () => {
    expect(plainText("**Look** closely")).toBe("Look closely");
  });
});
