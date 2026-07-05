import { Geometry2D } from './Geometry2D.js';

/**
 * A rectangle centered on the origin.
 */
export class RectGeometry extends Geometry2D {
  constructor(width = 1, height = 1) {
    const w = width / 2;
    const h = height / 2;

    // prettier-ignore
    const vertices = [
      // position   uv
      -w, -h,       0, 0,
       w, -h,       1, 0,
       w,  h,       1, 1,
      -w,  h,       0, 1,
    ];
    const indices = [0, 1, 2, 0, 2, 3];

    super(vertices, indices);
  }
}
