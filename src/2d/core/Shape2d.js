import { Object2d } from './Object2d.js';

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
}
