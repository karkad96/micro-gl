import { CylinderGeometry } from './CylinderGeometry.js';

/**
 * A Y-axis cone centered on the origin, with its base at -height / 2 and tip
 * at +height / 2. This is the pointed-top convenience form of
 * CylinderGeometry.
 */
export class ConeGeometry extends CylinderGeometry {
  constructor(
    radius = 1,
    height = 1,
    radialSegments = 24,
    heightSegments = 1,
    openEnded = false,
  ) {
    super(
      0,
      radius,
      height,
      radialSegments,
      heightSegments,
      openEnded,
    );
  }
}
