/** Numerical helpers used by the analytic layer to *measure* quantities from simulations. */

/** Least-squares line fit y = a + b·x. Returns slope, intercept and R². */
export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: NaN, intercept: NaN, r2: NaN };
  let sx = 0,
    sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n,
    my = sy / n;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx,
      dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? NaN : sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2 };
}

/**
 * Times at which `ys` crosses `level` going upward, linearly interpolated.
 */
export function upCrossings(ts: number[], ys: number[], level = 0): number[] {
  const out: number[] = [];
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1] - level,
      b = ys[i] - level;
    if (a < 0 && b >= 0) {
      const f = a / (a - b);
      out.push(ts[i - 1] + f * (ts[i] - ts[i - 1]));
    }
  }
  return out;
}

/** First time `ys` reaches `level` (in the direction of travel), interpolated. NaN if never. */
export function firstReach(ts: number[], ys: number[], level: number): number {
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1] - level,
      b = ys[i] - level;
    if (a === 0) return ts[i - 1];
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const f = a / (a - b);
      return ts[i - 1] + f * (ts[i] - ts[i - 1]);
    }
  }
  return NaN;
}

/** Mean period from successive upward crossings of the signal's mean. */
export function measurePeriod(ts: number[], ys: number[]): number {
  const mean = ys.reduce((s, v) => s + v, 0) / ys.length;
  const c = upCrossings(ts, ys, mean);
  if (c.length < 2) return NaN;
  return (c[c.length - 1] - c[0]) / (c.length - 1);
}

/**
 * Period from successive upward zero crossings of a signal that oscillates about zero
 * (e.g. a velocity). For a damped oscillator the zeros of the velocity stay exactly half a
 * damped period apart, unlike crossings of a drifting mean.
 */
export function zeroCrossPeriod(ts: number[], ys: number[]): number {
  const c = upCrossings(ts, ys, 0);
  if (c.length < 2) return NaN;
  return (c[c.length - 1] - c[0]) / (c.length - 1);
}

/** Least-squares polynomial fit y ≈ Σ cₖ xᵏ (k = 0..deg), via normal equations. */
export function polyFit(xs: number[], ys: number[], deg: number): number[] {
  const n = deg + 1;
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const pw: number[] = [1];
    for (let k = 1; k < 2 * n; k++) pw.push(pw[k - 1] * xs[i]);
    for (let r = 0; r < n; r++) {
      b[r] += pw[r] * ys[i];
      for (let c = 0; c < n; c++) A[r][c] += pw[r + c];
    }
  }
  // tiny local solver to keep numeric.ts dependency-free
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[piv], M[col]] = [M[col], M[piv]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Arithmetic–geometric mean (quadratically convergent). */
export function agm(a: number, b: number): number {
  for (let i = 0; i < 60 && Math.abs(a - b) > 1e-15 * a; i++) {
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = an;
  }
  return a;
}

/** Complete elliptic integral of the first kind K(k), modulus k, via AGM: K = π / (2·AGM(1, √(1−k²))). */
export function ellipticK(k: number): number {
  return Math.PI / (2 * agm(1, Math.sqrt(1 - k * k)));
}

export function percentError(measured: number, expected: number): number {
  if (expected === 0) return Math.abs(measured) < 1e-12 ? 0 : Math.abs(measured) * 100;
  return (Math.abs(measured - expected) / Math.abs(expected)) * 100;
}

export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;
