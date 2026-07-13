const PLANE_COMPONENTS = 4;
const PLANE_COUNT = 6;
const PLANE_EPSILON = 1e-12;
const INTERSECTION_EPSILON = 1e-6;
const PLANE_INDEX = Object.freeze({
  left: 0,
  right: 1,
  bottom: 2,
  top: 3,
  near: 4,
  far: 5,
});

const IDENTITY_ELEMENTS = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

/**
 * Six clipping planes extracted from a WebGPU view-projection matrix.
 * WebGPU depth is 0..w, so its near plane is `z >= 0` rather than the
 * OpenGL-style `z + w >= 0`.
 */
export class Frustum {
  constructor() {
    /** Packed normalized planes: x, y, z, constant. */
    this.planes = new Float32Array(PLANE_COUNT * PLANE_COMPONENTS);
    this.valid = false;
  }

  /** Replaces the planes from a column-major view-projection matrix. */
  setFromViewProjectionMatrix(matrix) {
    const e = matrix?.elements;
    if (!e || e.length < 16) {
      this.valid = false;
      return this;
    }

    this.valid = true;
    // Clip-space inequalities: x/y in -w..w and z in 0..w.
    this._setPlane(
      PLANE_INDEX.left,
      e[3] + e[0],
      e[7] + e[4],
      e[11] + e[8],
      e[15] + e[12],
    );
    this._setPlane(
      PLANE_INDEX.right,
      e[3] - e[0],
      e[7] - e[4],
      e[11] - e[8],
      e[15] - e[12],
    );
    this._setPlane(
      PLANE_INDEX.bottom,
      e[3] + e[1],
      e[7] + e[5],
      e[11] + e[9],
      e[15] + e[13],
    );
    this._setPlane(
      PLANE_INDEX.top,
      e[3] - e[1],
      e[7] - e[5],
      e[11] - e[9],
      e[15] - e[13],
    );
    this._setPlane(PLANE_INDEX.near, e[2], e[6], e[10], e[14]);
    this._setPlane(
      PLANE_INDEX.far,
      e[3] - e[2],
      e[7] - e[6],
      e[11] - e[10],
      e[15] - e[14],
    );
    return this;
  }

  /**
   * Tests a local-space axis-aligned box after `transform` is applied.
   * Invalid data fails open (visible) so culling never hides an object merely
   * because a custom matrix or dynamic geometry cannot be bounded safely.
   */
  intersectsBox(bounds, transform = null) {
    if (!this.valid) return true;
    const min = bounds?.min;
    const max = bounds?.max;
    if (!min || !max || min.length < 3 || max.length < 3) return true;

    for (let axis = 0; axis < 3; axis++) {
      if (min[axis] > max[axis]) return false;
      if (!Number.isFinite(min[axis]) || !Number.isFinite(max[axis])) {
        return true;
      }
    }

    const e = transform?.elements || IDENTITY_ELEMENTS;
    if (e.length < 16) return true;
    for (let i = 0; i < 16; i++) {
      if (!Number.isFinite(e[i])) return true;
    }

    const planes = this.planes;
    for (let offset = 0; offset < planes.length; offset += PLANE_COMPONENTS) {
      const px = planes[offset];
      const py = planes[offset + 1];
      const pz = planes[offset + 2];
      const pw = planes[offset + 3];

      // Transform the world-space plane into box-local space with M^T. The
      // positive local vertex gives the box's greatest signed plane distance.
      const qx = e[0] * px + e[1] * py + e[2] * pz + e[3] * pw;
      const qy = e[4] * px + e[5] * py + e[6] * pz + e[7] * pw;
      const qz = e[8] * px + e[9] * py + e[10] * pz + e[11] * pw;
      const qw = e[12] * px + e[13] * py + e[14] * pz + e[15] * pw;
      const x = qx >= 0 ? max[0] : min[0];
      const y = qy >= 0 ? max[1] : min[1];
      const z = qz >= 0 ? max[2] : min[2];
      const distance = qx * x + qy * y + qz * z + qw;
      if (!Number.isFinite(distance)) return true;
      if (distance < -INTERSECTION_EPSILON) return false;
    }
    return true;
  }

  _setPlane(index, x, y, z, constant) {
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(length) || length <= PLANE_EPSILON) {
      this.valid = false;
      return;
    }
    const offset = index * PLANE_COMPONENTS;
    const inverseLength = 1 / length;
    this.planes[offset] = x * inverseLength;
    this.planes[offset + 1] = y * inverseLength;
    this.planes[offset + 2] = z * inverseLength;
    this.planes[offset + 3] = constant * inverseLength;
    if (!Number.isFinite(this.planes[offset + 3])) this.valid = false;
  }
}
