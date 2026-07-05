import { Camera } from './Camera.js';

/**
 * An orthographic camera: objects keep the same size regardless of
 * distance.
 *
 * The view volume is defined by `size` (half the visible height in
 * world units) and `aspect`. Increase `zoom` to magnify.
 */
export class OrthographicCamera extends Camera {
  /**
   * @param {number} size   half of the visible height in world units
   * @param {number} aspect width / height
   */
  constructor(size = 5, aspect = 1, near = 0.1, far = 1000) {
    super(aspect, near, far);
    this.isOrthographic = true;
    this.size = size;
    this.zoom = 1;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    const halfH = this.size / this.zoom;
    const halfW = halfH * this.aspect;
    this.projectionMatrix.orthographic(
      -halfW,
      halfW,
      -halfH,
      halfH,
      this.near,
      this.far,
    );
  }
}
