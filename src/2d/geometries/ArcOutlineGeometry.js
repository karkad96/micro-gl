import { Geometry2d, VERTEX_SIZE_2D } from './Geometry2d.js';
import { TAU, wrapAngle } from '../../math/angles.js';
import { prepareLineGeometry } from '../../core/geometryData.js';

/**
 * An open circular arc represented by independent line-list edges. Pair it
 * with a material whose topology is `line-list`; native WebGPU lines are one
 * device pixel wide.
 */
export class ArcOutlineGeometry extends Geometry2d {
  /**
   * @param {number} radius radius in world units
   * @param {number} startAngle starting angle in radians
   * @param {number} sweepAngle signed angular span in radians; negative values
   *   run clockwise
   * @param {number} segments number of generated line segments
   * @param {object} [options]
   * @param {number} [options.hitTolerance=0.05] local-space picking tolerance;
   *   this does not affect the rendered line width
   */
  constructor(
    radius = 0.5,
    startAngle = 0,
    sweepAngle = Math.PI,
    segments = 32,
    { hitTolerance = 0.05 } = {},
  ) {
    assertFinitePositive(
      radius,
      'ArcOutlineGeometry radius must be a finite positive number',
    );
    assertFinite(
      startAngle,
      'ArcOutlineGeometry startAngle must be a finite number',
    );
    assertFinite(
      sweepAngle,
      'ArcOutlineGeometry sweepAngle must be a finite number',
    );
    if (sweepAngle === 0 || Math.abs(sweepAngle) > TAU) {
      throw new RangeError(
        'ArcOutlineGeometry sweepAngle magnitude must be greater than 0 and at most 2 PI',
      );
    }
    assertFiniteNonNegative(
      hitTolerance,
      'ArcOutlineGeometry hitTolerance must be a finite non-negative number',
    );
    segments = normalizeSegments(segments);
    startAngle = wrapAngle(startAngle);

    const vertices = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * sweepAngle;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      vertices.push(radius * c, radius * s, 0.5 + c * 0.5, 0.5 + s * 0.5);
      if (i < segments) indices.push(i, i + 1);
    }

    const data = prepareLineGeometry(
      'ArcOutlineGeometry',
      vertices,
      indices,
      VERTEX_SIZE_2D,
      2,
    );
    super(data.vertices, data.indices);
    this.radius = radius;
    this.startAngle = startAngle;
    this.sweepAngle = sweepAngle;
    this.segments = segments;
    this.hitTolerance = hitTolerance;
  }

  /** Tests the local-space distance to the generated polyline edges. */
  containsPoint(x, y) {
    const toleranceSquared = this.hitTolerance * this.hitTolerance;
    for (let i = 0; i < this.segments; i++) {
      const a = i * VERTEX_SIZE_2D;
      const b = (i + 1) * VERTEX_SIZE_2D;
      const ax = this.vertices[a];
      const ay = this.vertices[a + 1];
      const dx = this.vertices[b] - ax;
      const dy = this.vertices[b + 1] - ay;
      const lengthSquared = dx * dx + dy * dy;
      const projection =
        lengthSquared === 0
          ? 0
          : Math.min(
              1,
              Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared),
            );
      const offsetX = x - (ax + projection * dx);
      const offsetY = y - (ay + projection * dy);
      if (offsetX * offsetX + offsetY * offsetY <= toleranceSquared) {
        return true;
      }
    }
    return false;
  }
}

function assertFinite(value, message) {
  if (!Number.isFinite(value)) throw new RangeError(message);
}

function assertFinitePositive(value, message) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(message);
}

function assertFiniteNonNegative(value, message) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(message);
}

function normalizeSegments(segments) {
  assertFiniteNonNegative(
    segments,
    'ArcOutlineGeometry segments must be a finite non-negative number',
  );
  return Math.max(1, Math.floor(segments));
}
