/**
 * A 3x3 matrix for 2D affine transforms (translation, rotation, scale).
 *
 * Stored column-major with each column padded to 4 floats — the exact
 * layout WebGPU expects for a `mat3x3f` inside a uniform buffer, so
 * `elements` (12 floats) can be uploaded directly.
 *
 * Logical layout:      `elements` indices:
 *   | a  c  tx |         | 0  4   8 |
 *   | b  d  ty |         | 1  5   9 |
 *   | 0  0  1  |         | 2  6  10 |   (3, 7 and 11 are padding)
 */
export class Mat3 {
  constructor() {
    this.elements = new Float32Array(12);
    this.identity();
  }

  identity() {
    const e = this.elements;
    e.fill(0);
    e[0] = e[5] = e[10] = 1;
    return this;
  }

  copy(m) {
    this.elements.set(m.elements);
    return this;
  }

  /** this = this * m */
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }

  /** this = m * this */
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }

  /** this = a * b (safe even when this === a or this === b) */
  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;

    const a11 = ae[0],
      a12 = ae[4],
      a13 = ae[8];
    const a21 = ae[1],
      a22 = ae[5],
      a23 = ae[9];
    const a31 = ae[2],
      a32 = ae[6],
      a33 = ae[10];

    const b11 = be[0],
      b12 = be[4],
      b13 = be[8];
    const b21 = be[1],
      b22 = be[5],
      b23 = be[9];
    const b31 = be[2],
      b32 = be[6],
      b33 = be[10];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33;

    return this;
  }

  makeTranslation(x, y) {
    this.identity();
    const e = this.elements;
    e[8] = x;
    e[9] = y;
    return this;
  }

  makeRotation(angle) {
    this.identity();
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const e = this.elements;
    e[0] = c;
    e[4] = -s;
    e[1] = s;
    e[5] = c;
    return this;
  }

  makeScale(x, y) {
    this.identity();
    const e = this.elements;
    e[0] = x;
    e[5] = y;
    return this;
  }

  /**
   * Builds a transform from position, rotation (radians) and scale:
   * this = T * R * S. Small enough in 2D to write out directly.
   */
  compose(position, rotation, scale) {
    const c = Math.cos(rotation),
      s = Math.sin(rotation);
    const e = this.elements;
    e.fill(0);
    e[0] = c * scale.x;
    e[1] = s * scale.x;
    e[4] = -s * scale.y;
    e[5] = c * scale.y;
    e[8] = position.x;
    e[9] = position.y;
    e[10] = 1;
    return this;
  }

  /**
   * Inverts the matrix, assuming it is affine (bottom row 0 0 1) —
   * which holds for every matrix this engine composes.
   */
  invert() {
    const e = this.elements;
    const a = e[0],
      b = e[1],
      c = e[4],
      d = e[5],
      tx = e[8],
      ty = e[9];

    let det = a * d - b * c;
    if (det === 0) return this.identity();
    det = 1 / det;

    e[0] = d * det;
    e[1] = -b * det;
    e[4] = -c * det;
    e[5] = a * det;
    e[8] = (c * ty - d * tx) * det;
    e[9] = (b * tx - a * ty) * det;
    return this;
  }
}
