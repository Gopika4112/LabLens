import { describe, expect, it } from "vitest";
import { solveLinear, solveComplex, SingularMatrixError, type Complex } from "../src/math/linalg";
import { agm, ellipticK, linearFit, polyFit, upCrossings, zeroCrossPeriod } from "../src/math/numeric";

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1;
}

describe("dense linear solver", () => {
  it("solves random well-conditioned systems to machine precision", () => {
    const r = rng(7);
    for (let n = 1; n <= 12; n++) {
      const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => r() + (i === j ? n : 0)));
      const x = Array.from({ length: n }, () => r());
      const b = A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
      const y = solveLinear(A, b);
      y.forEach((v, i) => expect(v).toBeCloseTo(x[i], 12));
    }
  });
  it("needs pivoting (zero on the diagonal)", () => {
    expect(
      solveLinear(
        [
          [0, 1],
          [1, 0],
        ],
        [2, 3],
      ),
    ).toEqual([3, 2]);
  });
  it("detects singular matrices", () => {
    expect(() =>
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow(SingularMatrixError);
  });
  it("solves complex systems", () => {
    const A: Complex[][] = [
      [
        [2, 1],
        [0, -1],
      ],
      [
        [1, 0],
        [3, 2],
      ],
    ];
    const x: Complex[] = [
      [1, -1],
      [0.5, 2],
    ];
    const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const b = A.map((row) =>
      row.reduce<Complex>(
        (s, a, j) => {
          const p = mul(a, x[j]);
          return [s[0] + p[0], s[1] + p[1]];
        },
        [0, 0],
      ),
    );
    const y = solveComplex(A, b);
    y.forEach((v, i) => {
      expect(v[0]).toBeCloseTo(x[i][0], 12);
      expect(v[1]).toBeCloseTo(x[i][1], 12);
    });
  });
});

describe("numeric helpers", () => {
  it("AGM and elliptic K match reference values", () => {
    expect(agm(1, Math.SQRT1_2)).toBeCloseTo(0.847213084793979, 14);
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 14);
    expect(ellipticK(Math.sin(Math.PI / 4))).toBeCloseTo(1.8540746773013719, 13); // K(1/√2)
  });
  it("linear and polynomial fits recover exact coefficients", () => {
    const xs = [0, 1, 2, 3, 4];
    expect(
      linearFit(
        xs,
        xs.map((x) => 3 - 2 * x),
      ).slope,
    ).toBeCloseTo(-2, 12);
    const c = polyFit(
      xs,
      xs.map((x) => 1 + 2 * x - 0.5 * x * x),
      2,
    );
    expect(c[0]).toBeCloseTo(1, 10);
    expect(c[1]).toBeCloseTo(2, 10);
    expect(c[2]).toBeCloseTo(-0.5, 10);
  });
  it("finds zero crossings and periods by interpolation", () => {
    const ts = Array.from({ length: 2001 }, (_, i) => i * 0.005);
    const ys = ts.map((t) => Math.sin((2 * Math.PI * t) / 1.3));
    expect(upCrossings(ts, ys)[0]).toBeCloseTo(1.3, 4);
    expect(zeroCrossPeriod(ts, ys)).toBeCloseTo(1.3, 5);
  });
});
