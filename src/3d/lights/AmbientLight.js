import { Object3D } from '../core/Object3D.js';

/**
 * A light that illuminates every surface equally, regardless of
 * orientation. Used to keep shadows from being pitch black.
 * Multiple AmbientLights in a scene are added together.
 */
export class AmbientLight extends Object3D {
  /**
   * @param {number[]} color     [r, g, b] in the 0..1 range
   * @param {number}   intensity brightness multiplier
   */
  constructor(color = [1, 1, 1], intensity = 0.2) {
    super();
    this.color = color;
    this.intensity = intensity;
  }
}
