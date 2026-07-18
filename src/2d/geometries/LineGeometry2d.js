import { Geometry2d } from './Geometry2d.js';

/**
 * A filled line centered on the origin and extending along the local x axis.
 * Dimensions are expressed in world-space units before Shape2d transforms.
 * The quad uses CCW triangles for the default triangle-list topology.
 */
export class LineGeometry2d extends Geometry2d {
  constructor(length = 1, thickness = 0.05) {
    const halfLength = length / 2;
    const halfThickness = thickness / 2;

    // prettier-ignore
    const vertices = [
      // position                       uv
      -halfLength, -halfThickness,      0, 0,
      halfLength, -halfThickness,       1, 0,
      halfLength, halfThickness,        1, 1,
      -halfLength, halfThickness,       0, 1,
    ];
    const indices = [0, 1, 2, 0, 2, 3];

    super(vertices, indices);
  }
}
