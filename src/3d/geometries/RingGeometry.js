import { prepareTriangleGeometry } from '../../core/geometryData.js';
import { Geometry, VERTEX_SIZE } from './Geometry.js';
import {
  FULL_TURN,
  requireAngularLength,
  requireFinite,
  requireIntegerAtLeast,
  requireNonNegativeFinite,
  requirePositiveFinite,
  wrapAngle,
} from './primitiveGeometry.js';

/**
 * A single-sided annulus or annular sector in the XZ plane, facing +Y.
 * Partial sectors have open radial cut edges because the geometry has no
 * thickness. A negative `thetaLength` sweeps in the opposite angular
 * direction.
 */
export class RingGeometry extends Geometry {
  constructor(
    innerRadius = 0.5,
    outerRadius = 1,
    thetaSegments = 32,
    phiSegments = 1,
    thetaStart = 0,
    thetaLength = FULL_TURN,
  ) {
    requireNonNegativeFinite('RingGeometry', 'innerRadius', innerRadius);
    requirePositiveFinite('RingGeometry', 'outerRadius', outerRadius);
    if (innerRadius >= outerRadius) {
      throw new RangeError(
        'RingGeometry innerRadius must be less than outerRadius',
      );
    }
    requireIntegerAtLeast(
      'RingGeometry',
      'thetaSegments',
      thetaSegments,
      3,
    );
    requireIntegerAtLeast(
      'RingGeometry',
      'phiSegments',
      phiSegments,
      1,
    );
    requireFinite('RingGeometry', 'thetaStart', thetaStart);
    requireAngularLength('RingGeometry', 'thetaLength', thetaLength);
    thetaStart = wrapAngle(thetaStart);

    const vertices = [];
    const indices = [];
    const rowStride = thetaSegments + 1;

    for (let row = 0; row <= phiSegments; row++) {
      const radialT = row / phiSegments;
      const radius =
        innerRadius + (outerRadius - innerRadius) * radialT;
      for (let segment = 0; segment <= thetaSegments; segment++) {
        const angle =
          thetaStart + (segment / thetaSegments) * thetaLength;
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        vertices.push(
          x,
          0,
          z,
          0,
          1,
          0,
          0.5 + x / (outerRadius * 2),
          0.5 - z / (outerRadius * 2),
        );
      }
    }

    for (let row = 0; row < phiSegments; row++) {
      const radius =
        innerRadius + ((outerRadius - innerRadius) * row) / phiSegments;
      for (let segment = 0; segment < thetaSegments; segment++) {
        const inner = row * rowStride + segment;
        const innerNext = inner + 1;
        const outer = inner + rowStride;
        const outerNext = outer + 1;
        if (thetaLength > 0) {
          if (radius !== 0) {
            indices.push(inner, innerNext, outerNext);
          }
          indices.push(inner, outerNext, outer);
        } else {
          if (radius !== 0) {
            indices.push(inner, outerNext, innerNext);
          }
          indices.push(inner, outer, outerNext);
        }
      }
    }

    const data = prepareTriangleGeometry(
      'RingGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}
