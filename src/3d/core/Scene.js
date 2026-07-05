import { Object3D } from './Object3D.js';

/**
 * Root of the scene graph. Add meshes and lights to it, then pass it
 * to `renderer.render(scene, camera)`.
 */
export class Scene extends Object3D {
  constructor() {
    super();
    /** Clear color as [r, g, b, a] in the 0..1 range. */
    this.background = [0.05, 0.06, 0.09, 1];
  }
}
