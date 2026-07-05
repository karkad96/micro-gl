/**
 * A 4x4 matrix stored in column-major order (same layout WebGPU expects
 * inside uniform buffers, so `elements` can be uploaded directly).
 */
export class Mat4 {
  constructor() {
    this.elements = new Float32Array(16);
    this.identity();
  }

  identity() {
    const e = this.elements;
    e.fill(0);
    e[0] = e[5] = e[10] = e[15] = 1;
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
      a13 = ae[8],
      a14 = ae[12];
    const a21 = ae[1],
      a22 = ae[5],
      a23 = ae[9],
      a24 = ae[13];
    const a31 = ae[2],
      a32 = ae[6],
      a33 = ae[10],
      a34 = ae[14];
    const a41 = ae[3],
      a42 = ae[7],
      a43 = ae[11],
      a44 = ae[15];

    const b11 = be[0],
      b12 = be[4],
      b13 = be[8],
      b14 = be[12];
    const b21 = be[1],
      b22 = be[5],
      b23 = be[9],
      b24 = be[13];
    const b31 = be[2],
      b32 = be[6],
      b33 = be[10],
      b34 = be[14];
    const b41 = be[3],
      b42 = be[7],
      b43 = be[11],
      b44 = be[15];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return this;
  }

  makeTranslation(x, y, z) {
    this.identity();
    const e = this.elements;
    e[12] = x;
    e[13] = y;
    e[14] = z;
    return this;
  }

  makeRotationX(angle) {
    this.identity();
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const e = this.elements;
    e[5] = c;
    e[9] = -s;
    e[6] = s;
    e[10] = c;
    return this;
  }

  makeRotationY(angle) {
    this.identity();
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const e = this.elements;
    e[0] = c;
    e[8] = s;
    e[2] = -s;
    e[10] = c;
    return this;
  }

  makeRotationZ(angle) {
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

  makeScale(x, y, z) {
    this.identity();
    const e = this.elements;
    e[0] = x;
    e[5] = y;
    e[10] = z;
    return this;
  }

  /**
   * Builds a transform from position, Euler rotation (XYZ order, radians)
   * and scale: this = T * Rx * Ry * Rz * S
   */
  compose(position, rotation, scale) {
    this.makeTranslation(position.x, position.y, position.z);
    if (rotation.x !== 0) this.multiply(_tmp.makeRotationX(rotation.x));
    if (rotation.y !== 0) this.multiply(_tmp.makeRotationY(rotation.y));
    if (rotation.z !== 0) this.multiply(_tmp.makeRotationZ(rotation.z));
    if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
      this.multiply(_tmp.makeScale(scale.x, scale.y, scale.z));
    }
    return this;
  }

  /**
   * Perspective projection mapping depth to the [0, 1] range used by WebGPU.
   * @param {number} fovY vertical field of view in radians
   */
  perspective(fovY, aspect, near, far) {
    const e = this.elements;
    const f = 1 / Math.tan(fovY / 2);
    e.fill(0);
    e[0] = f / aspect;
    e[5] = f;
    e[10] = far / (near - far);
    e[11] = -1;
    e[14] = (far * near) / (near - far);
    return this;
  }

  /**
   * Orthographic projection mapping depth to the [0, 1] range used by WebGPU.
   */
  orthographic(left, right, bottom, top, near, far) {
    const e = this.elements;
    e.fill(0);
    e[0] = 2 / (right - left);
    e[5] = 2 / (top - bottom);
    e[10] = 1 / (near - far);
    e[12] = (left + right) / (left - right);
    e[13] = (bottom + top) / (bottom - top);
    e[14] = near / (near - far);
    e[15] = 1;
    return this;
  }

  /**
   * Builds a world matrix positioned at `eye` and oriented to face `target`.
   * Invert it to get a view matrix.
   */
  targetTo(eye, target, up) {
    let zx = eye.x - target.x;
    let zy = eye.y - target.y;
    let zz = eye.z - target.z;
    let len = Math.hypot(zx, zy, zz);
    if (len > 0) {
      zx /= len;
      zy /= len;
      zz /= len;
    }

    let xx = up.y * zz - up.z * zy;
    let xy = up.z * zx - up.x * zz;
    let xz = up.x * zy - up.y * zx;
    len = Math.hypot(xx, xy, xz);
    if (len === 0) {
      // View direction is parallel to `up` (e.g. a straight top-down
      // camera): nudge it sideways so the cross product is defined.
      if (Math.abs(up.z) === 1) {
        zx += 1e-4;
      } else {
        zz += 1e-4;
      }
      len = Math.hypot(zx, zy, zz);
      zx /= len;
      zy /= len;
      zz /= len;
      xx = up.y * zz - up.z * zy;
      xy = up.z * zx - up.x * zz;
      xz = up.x * zy - up.y * zx;
      len = Math.hypot(xx, xy, xz);
    }
    if (len > 0) {
      xx /= len;
      xy /= len;
      xz /= len;
    }

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    const e = this.elements;
    e[0] = xx;
    e[1] = xy;
    e[2] = xz;
    e[3] = 0;
    e[4] = yx;
    e[5] = yy;
    e[6] = yz;
    e[7] = 0;
    e[8] = zx;
    e[9] = zy;
    e[10] = zz;
    e[11] = 0;
    e[12] = eye.x;
    e[13] = eye.y;
    e[14] = eye.z;
    e[15] = 1;
    return this;
  }

  invert() {
    const e = this.elements;
    const a00 = e[0],
      a01 = e[1],
      a02 = e[2],
      a03 = e[3];
    const a10 = e[4],
      a11 = e[5],
      a12 = e[6],
      a13 = e[7];
    const a20 = e[8],
      a21 = e[9],
      a22 = e[10],
      a23 = e[11];
    const a30 = e[12],
      a31 = e[13],
      a32 = e[14],
      a33 = e[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det =
      b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (det === 0) return this.identity();
    det = 1 / det;

    e[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    e[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    e[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    e[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    e[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    e[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    e[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    e[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    e[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    e[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    e[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    e[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    e[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    e[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    e[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    e[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return this;
  }

  transpose() {
    const e = this.elements;
    let t;
    t = e[1];
    e[1] = e[4];
    e[4] = t;
    t = e[2];
    e[2] = e[8];
    e[8] = t;
    t = e[3];
    e[3] = e[12];
    e[12] = t;
    t = e[6];
    e[6] = e[9];
    e[9] = t;
    t = e[7];
    e[7] = e[13];
    e[13] = t;
    t = e[11];
    e[11] = e[14];
    e[14] = t;
    return this;
  }
}

const _tmp = new Mat4();
