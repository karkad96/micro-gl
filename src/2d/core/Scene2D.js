import { Object2D } from './Object2D.js';

/**
 * Root of the 2D scene graph. Add shapes to it, then pass it to
 * `renderer2d.render(scene, camera)`.
 */
export class Scene2D extends Object2D {
  constructor() {
    super();
    /** Clear color as [r, g, b, a] in the 0..1 range. */
    this.background = [0.05, 0.06, 0.09, 1];
  }
}
