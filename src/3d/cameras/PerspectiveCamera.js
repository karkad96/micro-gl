import { Camera } from './Camera.js';

/**
 * A perspective camera: distant objects appear smaller, like a real lens.
 */
export class PerspectiveCamera extends Camera {
  /**
   * @param {number} fov    vertical field of view in degrees
   * @param {number} aspect width / height
   */
  constructor(fov = 60, aspect = 1, near = 0.1, far = 1000) {
    super(aspect, near, far);
    this.fov = fov;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    this.projectionMatrix.perspective(
      (this.fov * Math.PI) / 180,
      this.aspect,
      this.near,
      this.far,
    );
  }
}
