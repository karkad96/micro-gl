/**
 * A 3-component vector. Used for positions, directions, scales and colors.
 */
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone() {
    return new Vec3(this.x, this.y, this.z);
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  crossVectors(a, b) {
    const ax = a.x,
      ay = a.y,
      az = a.z;
    const bx = b.x,
      by = b.y,
      bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  /**
   * Transforms this vector as a point by a Mat4, including the
   * perspective divide (so it also works with projection matrices).
   */
  applyMat4(m) {
    const e = m.elements;
    const { x, y, z } = this;
    const inverseW =
      1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * inverseW;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * inverseW;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * inverseW;
    return this;
  }

  length() {
    return Math.hypot(this.x, this.y, this.z);
  }

  normalize() {
    const len = this.length();
    if (len > 0) this.multiplyScalar(1 / len);
    return this;
  }
}
