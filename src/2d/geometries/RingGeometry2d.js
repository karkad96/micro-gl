import { Geometry2d, VERTEX_SIZE_2D } from './Geometry2d.js';
import { TAU, wrapAngle } from '../../math/angles.js';
import { prepareTriangleGeometry } from '../../core/geometryData.js';

const ANGLE_EPSILON = Number.EPSILON * 16;

/**
 * A filled annular sector centered on the origin. A zero inner radius creates
 * a pie sector, while a sweep whose magnitude reaches 2 PI creates a full
 * disk or ring.
 */
export class RingGeometry2d extends Geometry2d {
  /**
   * @param {number} innerRadius inner radius in world units
   * @param {number} outerRadius outer radius in world units
   * @param {number} segments number of angular subdivisions
   * @param {object} [options]
   * @param {number} [options.startAngle=0] starting angle in radians
   * @param {number} [options.sweepAngle=2*Math.PI] signed angular span;
   *   negative values run clockwise
   */
  constructor(
    innerRadius = 0.25,
    outerRadius = 0.5,
    segments = 32,
    { startAngle = 0, sweepAngle = TAU } = {},
  ) {
    assertFiniteNonNegative(
      innerRadius,
      'RingGeometry2d innerRadius must be a finite non-negative number',
    );
    assertFinitePositive(
      outerRadius,
      'RingGeometry2d outerRadius must be a finite positive number',
    );
    if (innerRadius >= outerRadius) {
      throw new RangeError(
        'RingGeometry2d innerRadius must be less than outerRadius',
      );
    }
    assertFinite(
      startAngle,
      'RingGeometry2d startAngle must be a finite number',
    );
    assertFinite(
      sweepAngle,
      'RingGeometry2d sweepAngle must be a finite number',
    );
    if (sweepAngle === 0 || Math.abs(sweepAngle) > TAU) {
      throw new RangeError(
        'RingGeometry2d sweepAngle magnitude must be greater than 0 and at most 2 PI',
      );
    }
    segments = normalizeSegments(segments);
    startAngle = wrapAngle(startAngle);

    const vertices = [];
    const indices = [];
    const toUv = (coordinate) => 0.5 + (coordinate / outerRadius) * 0.5;

    if (innerRadius === 0) {
      vertices.push(0, 0, 0.5, 0.5);
      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (i / segments) * sweepAngle;
        const x = Math.cos(angle) * outerRadius;
        const y = Math.sin(angle) * outerRadius;
        vertices.push(x, y, toUv(x), toUv(y));
      }

      for (let i = 0; i < segments; i++) {
        if (sweepAngle > 0) indices.push(0, i + 1, i + 2);
        else indices.push(0, i + 2, i + 1);
      }
    } else {
      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (i / segments) * sweepAngle;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const innerX = c * innerRadius;
        const innerY = s * innerRadius;
        const outerX = c * outerRadius;
        const outerY = s * outerRadius;
        vertices.push(
          innerX,
          innerY,
          toUv(innerX),
          toUv(innerY),
          outerX,
          outerY,
          toUv(outerX),
          toUv(outerY),
        );
      }

      for (let i = 0; i < segments; i++) {
        const inner = i * 2;
        const outer = inner + 1;
        const nextInner = inner + 2;
        const nextOuter = inner + 3;
        if (sweepAngle > 0) {
          indices.push(
            inner,
            outer,
            nextOuter,
            inner,
            nextOuter,
            nextInner,
          );
        } else {
          indices.push(
            inner,
            nextOuter,
            outer,
            inner,
            nextInner,
            nextOuter,
          );
        }
      }
    }

    const data = prepareTriangleGeometry(
      'RingGeometry2d',
      vertices,
      indices,
      VERTEX_SIZE_2D,
      2,
    );
    super(data.vertices, data.indices);
    this.innerRadius = innerRadius;
    this.outerRadius = outerRadius;
    this.segments = segments;
    this.startAngle = startAngle;
    this.sweepAngle = sweepAngle;
  }

  /** Exact radial and signed-angular test for the ideal annular sector. */
  containsPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    const distance = Math.hypot(x, y);
    if (distance < this.innerRadius || distance > this.outerRadius) {
      return false;
    }

    if (Math.abs(this.sweepAngle) >= TAU - ANGLE_EPSILON) return true;
    if (distance === 0 && this.innerRadius === 0) return true;

    const angle = Math.atan2(y, x);
    const delta =
      this.sweepAngle > 0
        ? wrapAngle(angle - this.startAngle)
        : wrapAngle(this.startAngle - angle);
    return delta <= Math.abs(this.sweepAngle) + ANGLE_EPSILON;
  }
}

function assertFinite(value, message) {
  if (!Number.isFinite(value)) throw new RangeError(message);
}

function assertFiniteNonNegative(value, message) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(message);
}

function assertFinitePositive(value, message) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(message);
}

function normalizeSegments(segments) {
  assertFiniteNonNegative(
    segments,
    'RingGeometry2d segments must be a finite non-negative number',
  );
  return Math.max(3, Math.floor(segments));
}
