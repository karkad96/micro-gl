import { Object2D } from '../core/Object2D.js';
import { Mat3 } from '../../math/Mat3.js';

/**
 * The 2D camera: `position` pans, `zoom` magnifies and `rotation` spins
 * the view. There is no perspective and no lookAt — the whole camera is
 * one 3x3 matrix.
 *
 * The visible area is defined by `size` (half the visible height in
 * world units) and `aspect`; the renderer keeps `aspect` in sync with
 * the canvas every frame. Expected to be unparented, like the 3D camera.
 */
export class Camera2D extends Object2D {
  /**
   * @param {number} size   half of the visible height in world units
   * @param {number} aspect width / height
   */
  constructor(size = 5, aspect = 1) {
    super();
    this.size = size;
    this.aspect = aspect;
    this.zoom = 1;

    this.projectionMatrix = new Mat3();
    this.viewMatrix = new Mat3();
    this.viewProjectionMatrix = new Mat3();
  }

  /** Maps the visible world rectangle onto clip space (-1..1). */
  updateProjectionMatrix() {
    const halfH = this.size / this.zoom;
    const halfW = halfH * this.aspect;
    this.projectionMatrix.makeScale(1 / halfW, 1 / halfH);
  }

  /** Called by the renderer every frame. */
  updateMatrices() {
    this.updateProjectionMatrix();
    this.worldMatrix.compose(this.position, this.rotation, this.scale);
    this.viewMatrix.copy(this.worldMatrix).invert();
    this.viewProjectionMatrix.multiplyMatrices(
      this.projectionMatrix,
      this.viewMatrix,
    );
  }
}
