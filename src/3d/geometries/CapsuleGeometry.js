import { prepareTriangleGeometry } from '../../core/geometryData.js';
import { Geometry, VERTEX_SIZE } from './Geometry.js';
import {
  FULL_TURN,
  requireIntegerAtLeast,
  requireNonNegativeFinite,
  requirePositiveFinite,
} from './primitiveGeometry.js';

/**
 * A closed Y-axis capsule centered on the origin. `length` is the straight
 * cylindrical body length between the hemisphere equators, so total height
 * is `length + 2 * radius`.
 */
export class CapsuleGeometry extends Geometry {
  constructor(
    radius = 0.5,
    length = 1,
    capSegments = 8,
    radialSegments = 16,
  ) {
    requirePositiveFinite('CapsuleGeometry', 'radius', radius);
    requireNonNegativeFinite('CapsuleGeometry', 'length', length);
    requireIntegerAtLeast(
      'CapsuleGeometry',
      'capSegments',
      capSegments,
      1,
    );
    requireIntegerAtLeast(
      'CapsuleGeometry',
      'radialSegments',
      radialSegments,
      3,
    );

    const rings = [];
    const halfLength = length / 2;
    const totalHeight = length + radius * 2;

    for (let segment = 0; segment <= capSegments; segment++) {
      const capAngle =
        -Math.PI / 2 + (segment / capSegments) * (Math.PI / 2);
      const normalY = segment === 0 ? -1 : Math.sin(capAngle);
      const normalRadius = segment === 0 ? 0 : Math.cos(capAngle);
      rings.push({
        y: -halfLength + radius * normalY,
        radius: radius * normalRadius,
        normalY,
        normalRadius,
      });
    }

    if (length > 0) {
      rings.push({
        y: halfLength,
        radius,
        normalY: 0,
        normalRadius: 1,
      });
    }

    for (let segment = 1; segment <= capSegments; segment++) {
      const capAngle = (segment / capSegments) * (Math.PI / 2);
      const normalY = segment === capSegments ? 1 : Math.sin(capAngle);
      const normalRadius =
        segment === capSegments ? 0 : Math.cos(capAngle);
      rings.push({
        y: halfLength + radius * normalY,
        radius: radius * normalRadius,
        normalY,
        normalRadius,
      });
    }

    const vertices = [];
    const indices = [];
    const rowStride = radialSegments + 1;

    for (const ring of rings) {
      const v = (ring.y + halfLength + radius) / totalHeight;
      for (let segment = 0; segment <= radialSegments; segment++) {
        const u = segment / radialSegments;
        const angle = u * FULL_TURN;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        vertices.push(
          ring.radius * cos,
          ring.y,
          ring.radius * sin,
          ring.normalRadius * cos,
          ring.normalY,
          ring.normalRadius * sin,
          u,
          v,
        );
      }
    }

    for (let row = 0; row < rings.length - 1; row++) {
      const lowerRadius = rings[row].radius;
      const upperRadius = rings[row + 1].radius;
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

    const data = prepareTriangleGeometry(
      'CapsuleGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}
