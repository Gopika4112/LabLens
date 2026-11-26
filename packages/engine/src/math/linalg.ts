/**
 * Small dense linear algebra, written from scratch.
 * Used by the mechanics constraint solver (J M⁻¹ Jᵀ λ = b) and by
 * Modified Nodal Analysis (G x = z), real and complex.
 */

export class SingularMatrixError extends Error {
  constructor(public readonly column: number) {
    super(`matrix is singular (no usable pivot in column ${column})`);
  }
}

/**
 * Solve A x = b by Gaussian elimination with partial pivoting.
 * A is n×n row-major (array of rows). Inputs are not modified.
 */
export function solveLinear(A: number[][], b: number[], eps = 1e-14): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const tol = eps * Math.max(1, scale);
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best <= tol) throw new SingularMatrixError(col);
    if (piv !== col) [M[piv], M[col]] = [M[col], M[piv]];
    const pr = M[col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / pr[col];
      if (f === 0) continue;
      const row = M[r];
      for (let c = col; c <= n; c++) row[c] -= f * pr[c];
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

/** Complex number as a tuple [re, im] — kept minimal and allocation-light. */
export type Complex = [number, number];
export const cadd = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
export const csub = (a: Complex, b: Complex): Complex => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
export const cabs = (a: Complex): number => Math.hypot(a[0], a[1]);
export const carg = (a: Complex): number => Math.atan2(a[1], a[0]);

/** Complex Gaussian elimination with partial pivoting (by modulus). */
export function solveComplex(A: Complex[][], b: Complex[], eps = 1e-300): Complex[] {
  const n = b.length;
  const M = A.map((row, i) => [...row.map((z) => [z[0], z[1]] as Complex), [b[i][0], b[i][1]] as Complex]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = cabs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = cabs(M[r][col]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best <= eps) throw new SingularMatrixError(col);
    if (piv !== col) [M[piv], M[col]] = [M[col], M[piv]];
    for (let r = col + 1; r < n; r++) {
      const f = cdiv(M[r][col], M[col][col]);
      for (let c = col; c <= n; c++) M[r][c] = csub(M[r][c], cmul(f, M[col][c]));
    }
  }
  const x: Complex[] = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s = csub(s, cmul(M[r][c], x[c]));
    x[r] = cdiv(s, M[r][r]);
  }
  return x;
}
