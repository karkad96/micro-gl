import { Geometry2d, VERTEX_SIZE_2D } from './Geometry2d.js';
import { prepareTriangleGeometry } from '../../core/geometryData.js';

const HALF_PI = Math.PI / 2;

/** A filled, centered rectangle with a shared circular corner radius. */
export class RoundedRectGeometry extends Geometry2d {
  /**
   * @param {number} width width in world units
   * @param {number} height height in world units
   * @param {number} radius requested corner radius; values larger than half
   *   the shortest side are clamped
   * @param {number} cornerSegments subdivisions per rounded corner
   */
  constructor(width = 1, height = 1, radius = 0.1, cornerSegments = 4) {
    assertFinitePositive(
      width,
      'RoundedRectGeometry width must be a finite positive number',
    );
    assertFinitePositive(
      height,
      'RoundedRectGeometry height must be a finite positive number',
    );
    assertFiniteNonNegative(
      radius,
      'RoundedRectGeometry radius must be a finite non-negative number',
    );
    cornerSegments = normalizeSegments(cornerSegments);

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    radius = Math.min(radius, halfWidth, halfHeight);
    const boundary = [];

    if (radius === 0) {
      boundary.push(
        [halfWidth, -halfHeight],
        [halfWidth, halfHeight],
        [-halfWidth, halfHeight],
        [-halfWidth, -halfHeight],
      );
    } else {
      const corners = [
        [halfWidth - radius, -halfHeight + radius, -HALF_PI],
        [halfWidth - radius, halfHeight - radius, 0],
        [-halfWidth + radius, halfHeight - radius, HALF_PI],
        [-halfWidth + radius, -halfHeight + radius, Math.PI],
      ];
      const dedupeEpsilon =
        Number.EPSILON * Math.max(1, width, height) * 16;

      for (const [centerX, centerY, startAngle] of corners) {
        for (let i = 0; i <= cornerSegments; i++) {
          const angle = startAngle + (i / cornerSegments) * HALF_PI;
          const point = [
            centerX + Math.cos(angle) * radius,
            centerY + Math.sin(angle) * radius,
          ];
          if (!samePoint(boundary.at(-1), point, dedupeEpsilon)) {
            boundary.push(point);
          }
        }
      }
      if (samePoint(boundary[0], boundary.at(-1), dedupeEpsilon)) {
        boundary.pop();
      }
    }

    const vertices = [0, 0, 0.5, 0.5];
    for (const [x, y] of boundary) {
      vertices.push(x, y, x / width + 0.5, y / height + 0.5);
    }

    const indices = [];
    for (let i = 0; i < boundary.length; i++) {
      indices.push(0, i + 1, ((i + 1) % boundary.length) + 1);
    }

    const data = prepareTriangleGeometry(
      'RoundedRectGeometry',
      vertices,
      indices,
      VERTEX_SIZE_2D,
      2,
    );
    super(data.vertices, data.indices);
    this.width = width;
    this.height = height;
    this.radius = radius;
    this.cornerSegments = cornerSegments;
    this._bounds = {
      min: [-halfWidth, -halfHeight],
      max: [halfWidth, halfHeight],
    };
  }

  /** Exact test against the straight sides and circular corner quadrants. */
  containsPoint(x, y) {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x) > halfWidth ||
      Math.abs(y) > halfHeight
    ) {
      return false;
    }
    if (this.radius === 0) return true;

    const cornerX = Math.max(Math.abs(x) - (halfWidth - this.radius), 0);
    const cornerY = Math.max(Math.abs(y) - (halfHeight - this.radius), 0);
    return (
      cornerX * cornerX + cornerY * cornerY <= this.radius * this.radius
    );
  }
}

function samePoint(a, b, epsilon) {
  return (
    a !== undefined &&
    Math.abs(a[0] - b[0]) <= epsilon &&
    Math.abs(a[1] - b[1]) <= epsilon
  );
}

function assertFiniteNonNegative(value, message) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(message);
}

function assertFinitePositive(value, message) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(message);
}

function normalizeSegments(cornerSegments) {
  assertFiniteNonNegative(
    cornerSegments,
    'RoundedRectGeometry cornerSegments must be a finite non-negative number',
  );
  return Math.max(1, Math.floor(cornerSegments));
}
