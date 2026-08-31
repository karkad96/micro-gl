import { prepareTriangleGeometry } from '../../core/geometryData.js';
import { Geometry, VERTEX_SIZE } from './Geometry.js';
import {
  FULL_TURN,
  requireAngularLength,
  requireFinite,
  requireIntegerAtLeast,
  requirePositiveFinite,
  wrapAngle,
} from './primitiveGeometry.js';

/**
 * A single-sided disk or sector in the XZ plane, facing +Y. Partial sectors
 * have open radial cut edges because the geometry has no thickness. A
 * negative `thetaLength` sweeps in the opposite angular direction.
 */
export class DiskGeometry extends Geometry {
  constructor(
    radius = 1,
    segments = 32,
    thetaStart = 0,
    thetaLength = FULL_TURN,
  ) {
    requirePositiveFinite('DiskGeometry', 'radius', radius);
    requireIntegerAtLeast('DiskGeometry', 'segments', segments, 3);
    requireFinite('DiskGeometry', 'thetaStart', thetaStart);
    requireAngularLength('DiskGeometry', 'thetaLength', thetaLength);
    thetaStart = wrapAngle(thetaStart);

    const vertices = [0, 0, 0, 0, 1, 0, 0.5, 0.5];
    const indices = [];

    for (let segment = 0; segment <= segments; segment++) {
      const angle = thetaStart + (segment / segments) * thetaLength;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      vertices.push(
        x,
        0,
        z,
        0,
        1,
        0,
        0.5 + x / (radius * 2),
        0.5 - z / (radius * 2),
      );
    }

    for (let segment = 0; segment < segments; segment++) {
      const current = 1 + segment;
      if (thetaLength > 0) indices.push(0, current + 1, current);
      else indices.push(0, current, current + 1);
    }

    const data = prepareTriangleGeometry(
      'DiskGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}
