import { Object3d } from './Object3d.js';

/**
 * A renderable object: a Geometry (the shape) combined with a Material
 * (how the surface is shaded).
 */
export class Mesh extends Object3d {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
