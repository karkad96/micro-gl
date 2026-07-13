import { Object3d } from './Object3d.js';

/**
 * Root of the scene graph. Add meshes and lights to it, then pass it
 * to `renderer.render(scene, camera)`.
 */
export class Scene extends Object3d {
  constructor() {
    super();
    /** sRGB clear color as [r, g, b, a] in the 0..1 range. */
    this.background = [0.05, 0.06, 0.09, 1];
  }
}
