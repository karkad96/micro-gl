import { Geometry } from './Geometry.js';

/**
 * A flat rectangle lying in the XZ plane, facing up (+Y).
 * Handy as a ground plane.
 */
export class PlaneGeometry extends Geometry {
  constructor(width = 1, depth = 1) {
    const w = width / 2;
    const d = depth / 2;

    // prettier-ignore
    const vertices = [
      // position   normal   uv
      -w, 0,  d,    0, 1, 0, 0, 0,
       w, 0,  d,    0, 1, 0, 1, 0,
       w, 0, -d,    0, 1, 0, 1, 1,
      -w, 0, -d,    0, 1, 0, 0, 1,
    ];
    const indices = [0, 1, 2, 0, 2, 3];

    super(vertices, indices);
  }
}
