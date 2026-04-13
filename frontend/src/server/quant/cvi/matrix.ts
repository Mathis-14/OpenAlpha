/**
 * Dense matrix utilities for CVI calibration.
 *
 * All matrices are stored in row-major Float64Array.
 * Only operations needed by the CVI pipeline are implemented.
 */

export class Matrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float64Array;

  constructor(rows: number, cols: number, data?: Float64Array) {
    this.rows = rows;
    this.cols = cols;
    this.data = data ?? new Float64Array(rows * cols);
  }

  static zeros(rows: number, cols: number): Matrix {
    return new Matrix(rows, cols);
  }

  static identity(n: number): Matrix {
    const m = new Matrix(n, n);
    for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
    return m;
  }

  static fromArray(rows: number, cols: number, values: number[]): Matrix {
    return new Matrix(rows, cols, Float64Array.from(values));
  }

  static fromRows(rowArrays: number[][]): Matrix {
    const rows = rowArrays.length;
    const cols = rowArrays[0]!.length;
    const m = new Matrix(rows, cols);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        m.data[i * cols + j] = rowArrays[i]![j]!;
      }
    }
    return m;
  }

  static columnVector(values: number[]): Matrix {
    return new Matrix(values.length, 1, Float64Array.from(values));
  }

  static diag(values: number[]): Matrix {
    const n = values.length;
    const m = new Matrix(n, n);
    for (let i = 0; i < n; i++) m.data[i * n + i] = values[i]!;
    return m;
  }

  get(i: number, j: number): number {
    return this.data[i * this.cols + j]!;
  }

  set(i: number, j: number, v: number): void {
    this.data[i * this.cols + j] = v;
  }

  clone(): Matrix {
    return new Matrix(this.rows, this.cols, new Float64Array(this.data));
  }

  /** Matrix addition: this + other */
  add(other: Matrix): Matrix {
    const out = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      out.data[i] = this.data[i]! + other.data[i]!;
    }
    return out;
  }

  /** Matrix subtraction: this - other */
  sub(other: Matrix): Matrix {
    const out = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      out.data[i] = this.data[i]! - other.data[i]!;
    }
    return out;
  }

  /** Scalar multiplication */
  scale(s: number): Matrix {
    const out = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      out.data[i] = this.data[i]! * s;
    }
    return out;
  }

  /** Transpose */
  transpose(): Matrix {
    const out = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        out.data[j * this.rows + i] = this.data[i * this.cols + j]!;
      }
    }
    return out;
  }

  /** Matrix multiply: this @ other */
  multiply(other: Matrix): Matrix {
    const out = new Matrix(this.rows, other.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let k = 0; k < this.cols; k++) {
        const aik = this.data[i * this.cols + k]!;
        if (aik === 0) continue;
        for (let j = 0; j < other.cols; j++) {
          out.data[i * other.cols + j] += aik * other.data[k * other.cols + j]!;
        }
      }
    }
    return out;
  }

  /** Matrix-vector multiply: this @ v, returns flat array */
  multiplyVector(v: number[]): number[] {
    const out = new Array<number>(this.rows).fill(0);
    for (let i = 0; i < this.rows; i++) {
      let sum = 0;
      for (let j = 0; j < this.cols; j++) {
        sum += this.data[i * this.cols + j]! * v[j]!;
      }
      out[i] = sum;
    }
    return out;
  }

  /** Extract a row as a number array */
  row(i: number): number[] {
    return Array.from(this.data.slice(i * this.cols, (i + 1) * this.cols));
  }

  /** Extract a column as a number array */
  col(j: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.rows; i++) {
      out.push(this.data[i * this.cols + j]!);
    }
    return out;
  }

  /** Set an entire row from an array */
  setRow(i: number, values: number[]): void {
    for (let j = 0; j < this.cols; j++) {
      this.data[i * this.cols + j] = values[j]!;
    }
  }

  /** Extract a sub-matrix (rows [r0, r1), cols [c0, c1)) */
  subMatrix(r0: number, r1: number, c0: number, c1: number): Matrix {
    const out = new Matrix(r1 - r0, c1 - c0);
    for (let i = r0; i < r1; i++) {
      for (let j = c0; j < c1; j++) {
        out.data[(i - r0) * out.cols + (j - c0)] = this.data[i * this.cols + j]!;
      }
    }
    return out;
  }

  /** Stack rows from multiple matrices vertically */
  static vstack(matrices: Matrix[]): Matrix {
    const cols = matrices[0]!.cols;
    const totalRows = matrices.reduce((s, m) => s + m.rows, 0);
    const out = new Matrix(totalRows, cols);
    let offset = 0;
    for (const m of matrices) {
      out.data.set(m.data, offset * cols);
      offset += m.rows;
    }
    return out;
  }

  /** Concatenate arrays horizontally */
  static hstack(matrices: Matrix[]): Matrix {
    const rows = matrices[0]!.rows;
    const totalCols = matrices.reduce((s, m) => s + m.cols, 0);
    const out = new Matrix(rows, totalCols);
    for (let i = 0; i < rows; i++) {
      let colOffset = 0;
      for (const m of matrices) {
        for (let j = 0; j < m.cols; j++) {
          out.data[i * totalCols + colOffset + j] = m.data[i * m.cols + j]!;
        }
        colOffset += m.cols;
      }
    }
    return out;
  }

  /** Gauss-Jordan inverse for small square matrices */
  inverse(): Matrix {
    const n = this.rows;
    const aug = new Matrix(n, 2 * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        aug.data[i * 2 * n + j] = this.data[i * n + j]!;
      }
      aug.data[i * 2 * n + n + i] = 1;
    }
    for (let col = 0; col < n; col++) {
      let maxRow = col;
      let maxVal = Math.abs(aug.data[col * 2 * n + col]!);
      for (let row = col + 1; row < n; row++) {
        const val = Math.abs(aug.data[row * 2 * n + col]!);
        if (val > maxVal) {
          maxVal = val;
          maxRow = row;
        }
      }
      if (maxVal < 1e-14) {
        throw new Error("Matrix is singular or near-singular");
      }
      if (maxRow !== col) {
        for (let j = 0; j < 2 * n; j++) {
          const tmp = aug.data[col * 2 * n + j]!;
          aug.data[col * 2 * n + j] = aug.data[maxRow * 2 * n + j]!;
          aug.data[maxRow * 2 * n + j] = tmp;
        }
      }
      const pivot = aug.data[col * 2 * n + col]!;
      for (let j = 0; j < 2 * n; j++) {
        aug.data[col * 2 * n + j] /= pivot;
      }
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = aug.data[row * 2 * n + col]!;
        for (let j = 0; j < 2 * n; j++) {
          aug.data[row * 2 * n + j] -= factor * aug.data[col * 2 * n + j]!;
        }
      }
    }
    const result = new Matrix(n, n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result.data[i * n + j] = aug.data[i * 2 * n + n + j]!;
      }
    }
    return result;
  }

  /** Condition number estimate (ratio of max/min singular values via power iteration). */
  conditionNumber(): number {
    const ata = this.transpose().multiply(this);
    const n = ata.rows;

    const powerIteration = (mat: Matrix, maxIter: number): number => {
      const x = new Array<number>(n).fill(1 / Math.sqrt(n));
      let eigenvalue = 0;
      for (let iter = 0; iter < maxIter; iter++) {
        const y = mat.multiplyVector(x);
        let norm = 0;
        for (const v of y) norm += v * v;
        norm = Math.sqrt(norm);
        if (norm < 1e-15) return 0;
        eigenvalue = norm;
        for (let i = 0; i < n; i++) x[i] = y[i]! / norm;
      }
      return eigenvalue;
    };

    const maxSv = Math.sqrt(powerIteration(ata, 100));

    // For min singular value, use inverse power iteration on A^T A
    // Approximate: use the inverse
    try {
      const inv = ata.inverse();
      const maxInvEig = powerIteration(inv, 100);
      const minSv = 1 / Math.sqrt(Math.max(maxInvEig, 1e-15));
      return maxSv / Math.max(minSv, 1e-15);
    } catch {
      return Infinity;
    }
  }

  /**
   * Cholesky decomposition: returns lower-triangular L such that this = L @ L^T.
   * Matrix must be symmetric positive definite.
   */
  cholesky(): Matrix {
    const n = this.rows;
    const L = Matrix.zeros(n, n);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) {
          sum += L.data[i * n + k]! * L.data[j * n + k]!;
        }
        if (i === j) {
          const diag = this.data[i * n + i]! - sum;
          if (diag <= 0) {
            // Add regularization and retry
            throw new Error("Matrix is not positive definite");
          }
          L.data[i * n + j] = Math.sqrt(diag);
        } else {
          L.data[i * n + j] = (this.data[i * n + j]! - sum) / L.data[j * n + j]!;
        }
      }
    }
    return L;
  }

  /** Solve L @ x = b where L is lower-triangular (forward substitution) */
  static forwardSolve(L: Matrix, b: number[]): number[] {
    const n = L.rows;
    const x = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < i; j++) {
        sum += L.data[i * n + j]! * x[j]!;
      }
      x[i] = (b[i]! - sum) / L.data[i * n + i]!;
    }
    return x;
  }

  /** Solve L^T @ x = b where L is lower-triangular (backward substitution) */
  static backwardSolve(L: Matrix, b: number[]): number[] {
    const n = L.rows;
    const x = new Array<number>(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let j = i + 1; j < n; j++) {
        sum += L.data[j * n + i]! * x[j]!;
      }
      x[i] = (b[i]! - sum) / L.data[i * n + i]!;
    }
    return x;
  }

  /**
   * Solve this @ x = b via Cholesky factorization.
   * this must be symmetric positive definite.
   * b can be a vector (number[]) or a Matrix.
   */
  choleskySolve(b: number[]): number[] {
    const L = this.cholesky();
    const y = Matrix.forwardSolve(L, b);
    return Matrix.backwardSolve(L, y);
  }

  /** Frobenius norm */
  norm(): number {
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      sum += this.data[i]! * this.data[i]!;
    }
    return Math.sqrt(sum);
  }

  /** Infinity norm (max row sum) */
  infNorm(): number {
    let maxSum = 0;
    for (let i = 0; i < this.rows; i++) {
      let sum = 0;
      for (let j = 0; j < this.cols; j++) {
        sum += Math.abs(this.data[i * this.cols + j]!);
      }
      if (sum > maxSum) maxSum = sum;
    }
    return maxSum;
  }
}

/** Element-wise vector operations */
export function vecAdd(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]!);
}

export function vecSub(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - b[i]!);
}

export function vecScale(a: number[], s: number): number[] {
  return a.map((v) => v * s);
}

export function vecDot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function vecNorm(a: number[]): number {
  return Math.sqrt(vecDot(a, a));
}

export function vecMax(a: number[]): number {
  let max = -Infinity;
  for (const v of a) if (v > max) max = v;
  return max;
}

export function linspace(start: number, end: number, n: number): number[] {
  if (n <= 1) return [start];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + step * i);
}

export function clip(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
