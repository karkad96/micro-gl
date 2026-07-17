import { Object3d } from '../core/Object3d.js';
import { Vec3 } from '../../math/Vec3.js';
import { DirectionalShadow } from './DirectionalShadow.js';

/**
 * A light that shines in one direction from infinitely far away,
 * like the sun. The renderer uses the first DirectionalLight it
 * finds in the scene.
 */
export class DirectionalLight extends Object3d {
  /**
   * @param {number[]} color     [r, g, b] in the 0..1 range
   * @param {number}   intensity brightness multiplier
   */
  constructor(color = [1, 1, 1], intensity = 1) {
    super();
    this.color = color;
    this.intensity = intensity;
    /**
     * The direction the light travels in. The renderer normalizes finite
     * values; invalid or effectively zero directions fall back to (0, -1, 0).
     */
    this.direction = new Vec3(-1, -1, -1);
    /** Enable the renderer's directional shadow pass for this light. */
    this.castShadow = false;
    /** Shadow-map resolution, bias and orthographic camera configuration. */
    this.shadow = new DirectionalShadow();
  }
}
