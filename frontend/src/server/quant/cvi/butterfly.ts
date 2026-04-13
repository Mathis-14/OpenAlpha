/**
 * Butterfly (no-arbitrage PDF) constraint math for CVI.
 *
 * The PDF is non-negative iff c(z) >= g(v(z), s(z), k(z)) for all z,
 * where c = normalized convexity, s = normalized skew, v = variance.
 *
 * Port of: vol-surface-cvi/src/cvi/qp_builder.py (lines 24-117)
 */

/**
 * Nonlinear butterfly lower bound g(v, s, k).
 *
 * The PDF is non-negative iff c(z) >= g(v, s) for all z.
 */
export function butterflyG(
  v: number[],
  s: number[],
  k: number[],
  vStar: number,
  T: number,
): number[] {
  return v.map((vi, idx) => butterflyGScalar(vi, s[idx]!, k[idx]!, vStar, T));
}

/**
 * Scalar version of butterflyG for a single point.
 */
export function butterflyGScalar(
  v: number,
  s: number,
  k: number,
  vStar: number,
  T: number,
): number {
  if (v <= 0 || !isFinite(v)) return 0;
  const sqrtVT = Math.sqrt(v * T);
  if (sqrtVT < 1e-15) return 0;
  const d1 = (-k + v * T / 2) / sqrtVT;
  const d2 = (-k - v * T / 2) / sqrtVT;

  const result =
    (vStar / (2 * v)) * s * s +
    Math.sqrt(vStar * T) * s -
    2 * (1 + d1 * Math.sqrt(vStar / v) * s + d1 * d2 * (vStar / (4 * v)) * s * s);

  return isFinite(result) ? result : 0;
}

/**
 * Analytical dg/ds (beta_1) — partial derivative of butterfly bound w.r.t. normalized skew.
 */
export function butterflyDgDs(
  v: number[],
  s: number[],
  k: number[],
  vStar: number,
  T: number,
): number[] {
  return v.map((vi, idx) => {
    if (vi <= 0 || !isFinite(vi)) return 0;
    const si = s[idx]!;
    const ki = k[idx]!;
    const sqrtVT = Math.sqrt(vi * T);
    if (sqrtVT < 1e-15) return 0;
    const d1 = (-ki + vi * T / 2) / sqrtVT;
    const d2 = (-ki - vi * T / 2) / sqrtVT;

    const result =
      (vStar / vi) * si +
      Math.sqrt(vStar * T) -
      2 * (d1 * Math.sqrt(vStar / vi) + d1 * d2 * (vStar / (2 * vi)) * si);

    return isFinite(result) ? result : 0;
  });
}

/**
 * Numerical dg/dv (beta_2) — partial derivative via central difference.
 */
export function butterflyDgDv(
  v: number[],
  s: number[],
  k: number[],
  vStar: number,
  T: number,
): number[] {
  return v.map((vi, idx) => {
    // Use relative perturbation to avoid negative variance
    const eps = Math.max(vi * 1e-4, 1e-12);
    const vp = vi + eps;
    const vm = Math.max(vi - eps, 1e-15);
    const actualDv = vp - vm;
    const gp = butterflyGScalar(vp, s[idx]!, k[idx]!, vStar, T);
    const gm = butterflyGScalar(vm, s[idx]!, k[idx]!, vStar, T);
    if (!isFinite(gp) || !isFinite(gm)) return 0;
    return (gp - gm) / actualDv;
  });
}

/**
 * Check the d1*d2 > 1 prerequisite for edge butterfly constraints.
 */
export function checkD1D2Condition(v: number, k: number, T: number): boolean {
  const d1d2 = (k * k) / (v * T) - (v * T) / 4;
  return d1d2 > 1;
}

/**
 * Compute (s_lower, s_upper) from the butterfly quadratic at edge knots.
 *
 * At edges c=0, so the butterfly condition 0 >= g(v, s) becomes a quadratic in s.
 * Prerequisite: d1*d2 > 1 (ensures A_s < 0 and real roots).
 */
export function edgeSBounds(
  v: number,
  k: number,
  vStar: number,
  T: number,
): [number, number] {
  if (v <= 1e-12 || !isFinite(v)) return [-1e6, 1e6];
  const d1d2 = (k * k) / (v * T) - (v * T) / 4;
  const A = (vStar / (2 * v)) * (1 - d1d2);
  if (Math.abs(A) < 1e-15) return [-1e6, 1e6];
  const B = (2 * k * Math.sqrt(vStar)) / (v * Math.sqrt(T));
  const disc = vStar * (T + 4 / v);
  if (disc < 0) return [-1e6, 1e6];
  const sqrtDisc = Math.sqrt(disc);
  const s1 = (-B + sqrtDisc) / (2 * A);
  const s2 = (-B - sqrtDisc) / (2 * A);
  if (!isFinite(s1) || !isFinite(s2)) return [-1e6, 1e6];
  return [Math.min(s1, s2), Math.max(s1, s2)];
}

/**
 * Linearized edge bound: (s_bound_ref, ds_bound/dv).
 *
 * @param which - 'lower' for z_{n-1} (right edge), 'upper' for z_0 (left edge)
 */
export function edgeBoundLinearized(
  vRef: number,
  k: number,
  vStar: number,
  T: number,
  which: "lower" | "upper",
): { boundRef: number; dsDv: number } {
  const [sLower, sUpper] = edgeSBounds(vRef, k, vStar, T);
  const boundRef = which === "lower" ? sLower : sUpper;

  const eps = Math.max(vRef * 1e-4, 1e-12);
  const vPlus = vRef + eps;
  const vMinus = Math.max(vRef - eps, 1e-15);
  const actualDv = vPlus - vMinus;

  const [sLowerP, sUpperP] = edgeSBounds(vPlus, k, vStar, T);
  const [sLowerM, sUpperM] = edgeSBounds(vMinus, k, vStar, T);

  const boundP = which === "lower" ? sLowerP : sUpperP;
  const boundM = which === "lower" ? sLowerM : sUpperM;
  const dsDv = (boundP - boundM) / actualDv;

  if (!isFinite(dsDv)) return { boundRef, dsDv: 0 };
  return { boundRef, dsDv };
}
