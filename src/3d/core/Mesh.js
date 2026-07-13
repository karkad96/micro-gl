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
    /** Set false to bypass camera and shadow-camera frustum culling. */
    this.frustumCulled = true;
    /** Whether this mesh is drawn into an enabled directional shadow map. */
    this.castShadow = false;
    /** Whether lit materials on this mesh are darkened by that shadow map. */
    this.receiveShadow = false;
    /** View-space depth, written by the renderer's transparent sort. */
    this._viewDepth = 0;
  }

  /** Local-space bounds used for conservative renderer culling. */
  get bounds() {
    return this.geometry?.bounds || null;
  }
}
