import { prepareTriangleGeometry } from '../../core/geometryData.js';
import { Geometry, VERTEX_SIZE } from './Geometry.js';
import {
  FULL_TURN,
  requireAngularLength,
  requireIntegerAtLeast,
  requirePositiveFinite,
} from './primitiveGeometry.js';

/**
 * A Y-axis ring torus. Signed `arc` controls the major circle; partial arcs
 * leave their two end seams open and uncapped.
 */
export class TorusGeometry extends Geometry {
  constructor(
    radius = 1,
    tube = 0.25,
    radialSegments = 16,
    tubularSegments = 32,
    arc = FULL_TURN,
  ) {
    requirePositiveFinite('TorusGeometry', 'radius', radius);
    requirePositiveFinite('TorusGeometry', 'tube', tube);
    if (tube >= radius) {
      throw new RangeError(
        'TorusGeometry tube must be less than the major radius',
      );
    }
    requireIntegerAtLeast(
      'TorusGeometry',
      'radialSegments',
      radialSegments,
      3,
    );
    requireIntegerAtLeast(
      'TorusGeometry',
      'tubularSegments',
      tubularSegments,
      3,
    );
    requireAngularLength('TorusGeometry', 'arc', arc);

    const vertices = [];
    const indices = [];
    const rowStride = radialSegments + 1;

    for (let majorSegment = 0; majorSegment <= tubularSegments; majorSegment++) {
      const u = majorSegment / tubularSegments;
      const majorAngle = u * arc;
      const majorCos = Math.cos(majorAngle);
      const majorSin = Math.sin(majorAngle);

      for (
        let radialSegment = 0;
        radialSegment <= radialSegments;
        radialSegment++
      ) {
        const v = radialSegment / radialSegments;
        const tubeAngle = v * FULL_TURN;
        const tubeCos = Math.cos(tubeAngle);
        const tubeSin = Math.sin(tubeAngle);
        const ringRadius = radius + tube * tubeCos;
        vertices.push(
          ringRadius * majorCos,
          tube * tubeSin,
          ringRadius * majorSin,
          tubeCos * majorCos,
          tubeSin,
          tubeCos * majorSin,
          u,
          v,
        );
      }
    }

    for (let majorSegment = 0; majorSegment < tubularSegments; majorSegment++) {
      for (
        let radialSegment = 0;
        radialSegment < radialSegments;
        radialSegment++
      ) {
        const current = majorSegment * rowStride + radialSegment;
        const radialNext = current + 1;
        const majorNext = current + rowStride;
        const diagonal = majorNext + 1;
        if (arc > 0) {
          indices.push(
            current,
            radialNext,
            majorNext,
            majorNext,
            radialNext,
            diagonal,
          );
        } else {
          indices.push(
            current,
            majorNext,
            radialNext,
            majorNext,
            diagonal,
            radialNext,
          );
        }
      }
    }

    const data = prepareTriangleGeometry(
      'TorusGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}
