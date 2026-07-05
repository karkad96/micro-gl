import { Object3D } from '../core/Object3D.js';
import { Vec3 } from '../../math/Vec3.js';

/**
 * A light that shines in one direction from infinitely far away,
 * like the sun. The renderer uses the first DirectionalLight it
 * finds in the scene.
 */
export class DirectionalLight extends Object3D {
  /**
   * @param {number[]} color     [r, g, b] in the 0..1 range
   * @param {number}   intensity brightness multiplier
   */
  constructor(color = [1, 1, 1], intensity = 1) {
    super();
    this.color = color;
    this.intensity = intensity;
    /** The direction the light travels in (it gets normalized by the renderer). */
    this.direction = new Vec3(-1, -1, -1);
  }
}
