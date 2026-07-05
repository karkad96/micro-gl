import { Object3D } from '../core/Object3D.js';
import { Vec3 } from '../../math/Vec3.js';
import { Mat4 } from '../../math/Mat4.js';

/**
 * Base class for cameras. Set `position`, call `lookAt(...)` to aim it,
 * and the renderer takes care of the rest (it keeps `aspect` in sync
 * with the canvas and refreshes the matrices every frame).
 *
 * Subclasses implement `updateProjectionMatrix()` and must call it once
 * at the end of their constructor.
 *
 * Note: for simplicity a camera derives its orientation from
 * position + target (not from `rotation`), and is expected to be a
 * direct child of the scene (or unparented).
 */
export class Camera extends Object3D {
  /**
   * @param {number} aspect width / height
   */
  constructor(aspect = 1, near = 0.1, far = 1000) {
    super();
    this.aspect = aspect;
    this.near = near;
    this.far = far;

    this.up = new Vec3(0, 1, 0);
    this.target = new Vec3(0, 0, 0);

    this.projectionMatrix = new Mat4();
    this.viewMatrix = new Mat4();
    this.viewProjectionMatrix = new Mat4();
  }

  /** Aims the camera at a point. Accepts a Vec3 or (x, y, z). */
  lookAt(x, y, z) {
    if (typeof x === 'object') {
      this.target.copy(x);
    } else {
      this.target.set(x, y, z);
    }
    return this;
  }

  updateProjectionMatrix() {
    throw new Error('Camera subclasses must implement updateProjectionMatrix');
  }

  /** Called by the renderer every frame. */
  updateMatrices() {
    this.updateProjectionMatrix();
    this.worldMatrix.targetTo(this.position, this.target, this.up);
    this.viewMatrix.copy(this.worldMatrix).invert();
    this.viewProjectionMatrix.multiplyMatrices(
      this.projectionMatrix,
      this.viewMatrix,
    );
  }
}
