import { Geometry } from './Geometry.js';
import {
  appendCap,
  appendConeSide,
  appendShoulder,
  appendTubeSide,
  normalizeRadialSegments,
} from './radialGeometry.js';

/**
 * A filled arrow centered on the origin and pointing along the local +X axis.
 * The shaft is a circular tube and the head is a closed cone.
 */
export class ArrowGeometry extends Geometry {
  constructor(
    length = 1,
    shaftWidth = 0.05,
    headLength = 0.25,
    headWidth = 0.2,
    radialSegments = 8,
  ) {
    radialSegments = normalizeRadialSegments(radialSegments);
    const halfLength = length / 2;
    const tailX = -halfLength;
    const headBaseX = halfLength - headLength;
    const tipX = halfLength;
    const shaftRadius = shaftWidth / 2;
    const headRadius = headWidth / 2;
    const headBaseU = (headBaseX - tailX) / length;
    const vertices = [];
    const indices = [];

    appendTubeSide(
      vertices,
      indices,
      tailX,
      headBaseX,
      shaftRadius,
      radialSegments,
      0,
      headBaseU,
    );
    appendCap(
      vertices,
      indices,
      tailX,
      shaftRadius,
      radialSegments,
      -1,
    );
    appendShoulder(
      vertices,
      indices,
      headBaseX,
      shaftRadius,
      headRadius,
      radialSegments,
    );
    appendConeSide(
      vertices,
      indices,
      headBaseX,
      tipX,
      headRadius,
      radialSegments,
      headBaseU,
      1,
    );

    super(vertices, indices);
  }
}
