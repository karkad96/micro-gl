import { Object3d } from '../core/Object3d.js';

/**
 * A light that radiates from a point in all directions, fading with
 * distance — a lamp. It sits in the scene graph like any object: its
 * world position (parenting included) is where the light comes from.
 *
 * Brightness falls off as 1 / (1 + distance²), so `intensity` is the
 * brightness right at the light and roughly a tenth of it three units
 * away. The renderer uses the first MAX_POINT_LIGHTS (4) visible
 * PointLights it finds in the scene; extras are ignored.
 */
export class PointLight extends Object3d {
  /**
   * @param {number[]} color     [r, g, b] in the 0..1 range
   * @param {number}   intensity brightness multiplier
   */
  constructor(color = [1, 1, 1], intensity = 1) {
    super();
    this.color = color;
    this.intensity = intensity;
  }
}
