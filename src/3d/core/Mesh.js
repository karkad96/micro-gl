import { Object3D } from './Object3D.js';

/**
 * A renderable object: a Geometry (the shape) combined with a Material
 * (how the surface is shaded).
 */
export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
