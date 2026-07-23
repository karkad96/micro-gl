import { Object3d } from './Object3d.js';
import { normalizeDirection3d } from '../../math/direction.js';

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

  /**
   * Rotates the mesh so its local +X axis follows a parent-local direction.
   * Accepts a vector-like object/array or numeric (x, y, z) components.
   * Direction magnitude is ignored; geometry length and scale are unchanged.
   */
  setDirection(x, y, z) {
    const [dx, dy, dz] = normalizeDirection3d(x, y, z);
    const horizontalLength = Math.hypot(dx, dz);

    this.rotation.set(
      0,
      horizontalLength === 0 ? 0 : Math.atan2(-dz, dx),
      Math.atan2(dy, horizontalLength),
    );
    return this;
  }
}
