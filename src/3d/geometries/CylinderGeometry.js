import { Geometry, VERTEX_SIZE } from './Geometry.js';
import { prepareTriangleGeometry } from '../../core/geometryData.js';
import {
  FULL_TURN,
  requireBoolean,
  requireIntegerAtLeast,
  requireNonNegativeFinite,
  requirePositiveFinite,
} from './primitiveGeometry.js';

function appendCap(vertices, indices, y, radius, radialSegments, top) {
  const normalY = top ? 1 : -1;
  const center = vertices.length / VERTEX_SIZE;
  vertices.push(0, y, 0, 0, normalY, 0, 0.5, 0.5);
  const ring = vertices.length / VERTEX_SIZE;

  for (let segment = 0; segment <= radialSegments; segment++) {
    const angle = (segment / radialSegments) * FULL_TURN;
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    vertices.push(
      x,
      y,
      z,
      0,
      normalY,
      0,
      0.5 + x / (radius * 2),
      0.5 - z / (radius * 2),
    );
  }

  for (let segment = 0; segment < radialSegments; segment++) {
    const current = ring + segment;
    const next = current + 1;
    if (top) indices.push(center, next, current);
    else indices.push(center, current, next);
  }
}

/**
 * A Y-axis cylinder or frustum centered on the origin. Set either radius to
 * zero to form a pointed end. Closed ends get separate vertices so their
 * normals and disk-mapped uvs remain correct.
 */
export class CylinderGeometry extends Geometry {
  constructor(
    radiusTop = 1,
    radiusBottom = 1,
    height = 1,
    radialSegments = 24,
    heightSegments = 1,
    openEnded = false,
  ) {
    requireNonNegativeFinite('CylinderGeometry', 'radiusTop', radiusTop);
    requireNonNegativeFinite(
      'CylinderGeometry',
      'radiusBottom',
      radiusBottom,
    );
    if (radiusTop === 0 && radiusBottom === 0) {
      throw new RangeError(
        'CylinderGeometry radiusTop and radiusBottom cannot both be zero',
      );
    }
    requirePositiveFinite('CylinderGeometry', 'height', height);
    requireIntegerAtLeast(
      'CylinderGeometry',
      'radialSegments',
      radialSegments,
      3,
    );
    requireIntegerAtLeast(
      'CylinderGeometry',
      'heightSegments',
      heightSegments,
      1,
    );
    requireBoolean('CylinderGeometry', 'openEnded', openEnded);

    const vertices = [];
    const indices = [];
    const halfHeight = height / 2;
    const slope = (radiusBottom - radiusTop) / height;
    const normalScale = 1 / Math.hypot(1, slope);
    const rowStride = radialSegments + 1;
    const radiusAt = (row) => {
      if (row === 0) return radiusBottom;
      if (row === heightSegments) return radiusTop;
      return (
        radiusBottom +
        (radiusTop - radiusBottom) * (row / heightSegments)
      );
    };

    for (let row = 0; row <= heightSegments; row++) {
      const v = row / heightSegments;
      const y = -halfHeight + height * v;
      const radius = radiusAt(row);

      for (let segment = 0; segment <= radialSegments; segment++) {
        const u = segment / radialSegments;
        const angle = u * FULL_TURN;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        vertices.push(
          radius * cos,
          y,
          radius * sin,
          cos * normalScale,
          slope * normalScale,
          sin * normalScale,
          u,
          v,
        );
      }
    }

    for (let row = 0; row < heightSegments; row++) {
      const lowerRadius = radiusAt(row);
      const upperRadius = radiusAt(row + 1);
      for (let segment = 0; segment < radialSegments; segment++) {
        const lower = row * rowStride + segment;
        const lowerNext = lower + 1;
        const upper = lower + rowStride;
        const upperNext = upper + 1;
        if (lowerRadius !== 0) {
          indices.push(lower, upperNext, lowerNext);
        }
        if (upperRadius !== 0) {
          indices.push(lower, upper, upperNext);
        }
      }
    }

    if (!openEnded) {
      if (radiusBottom > 0) {
        appendCap(
          vertices,
          indices,
          -halfHeight,
          radiusBottom,
          radialSegments,
          false,
        );
      }
      if (radiusTop > 0) {
        appendCap(
          vertices,
          indices,
          halfHeight,
          radiusTop,
          radialSegments,
          true,
        );
      }
    }

    const data = prepareTriangleGeometry(
      'CylinderGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}
