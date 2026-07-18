import { Geometry } from './Geometry.js';
import {
  appendCap,
  appendTubeSide,
  normalizeRadialSegments,
} from './radialGeometry.js';

/**
 * A filled line centered on the origin and extending along the local X axis.
 * Its world-space thickness is tessellated as a capped circular tube.
 */
export class LineGeometry extends Geometry {
  constructor(length = 1, thickness = 0.05, radialSegments = 8) {
    radialSegments = normalizeRadialSegments(radialSegments);
    const halfLength = length / 2;
    const radius = thickness / 2;
    const vertices = [];
    const indices = [];

    appendTubeSide(
      vertices,
      indices,
      -halfLength,
      halfLength,
      radius,
      radialSegments,
      0,
      1,
    );
    appendCap(
      vertices,
      indices,
      -halfLength,
      radius,
      radialSegments,
      -1,
    );
    appendCap(
      vertices,
      indices,
      halfLength,
      radius,
      radialSegments,
      1,
    );

    super(vertices, indices);
  }
}
