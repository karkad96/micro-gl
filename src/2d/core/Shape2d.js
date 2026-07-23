import { Object2d } from './Object2d.js';
import { normalizeDirection2d } from '../../math/direction.js';

/**
 * A renderable 2D object: a Geometry2d (the outline) combined with a
 * Material2d (how it is filled) — the 2D counterpart of Mesh.
 */
export class Shape2d extends Object2d {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }

  /**
   * Rotates the shape so its local +X axis follows a parent-local direction.
   * Accepts a vector-like object/array or numeric (x, y) components.
   * Direction magnitude is ignored; geometry length and scale are unchanged.
   */
  setDirection(x, y) {
    const [dx, dy] = normalizeDirection2d(x, y);
    this.rotation = Math.atan2(dy, dx);
    return this;
  }
}
