import { Object2D } from './Object2D.js';

/**
 * A renderable 2D object: a Geometry2D (the outline) combined with a
 * Material2D (how it is filled) — the 2D counterpart of Mesh.
 */
export class Shape2D extends Object2D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
