import { Geometry2d, VERTEX_SIZE_2D } from './Geometry2d.js';
import { TAU, wrapAngle } from '../../math/angles.js';
import { prepareLineGeometry } from '../../core/geometryData.js';

const RADIUS_RELATIVE_TOLERANCE = 1e-6;
const ANGULAR_TOLERANCE = Number.EPSILON * 16;

/**
 * An open circular arc represented by independent line-list edges. Pair it
 * with a material whose topology is `line-list`; native WebGPU lines are one
 * device pixel wide.
 */
export class ArcOutlineGeometry extends Geometry2d {
  /**
   * Creates an arc from its center and two points on the circle.
   *
   * The shorter signed arc is used by default. Point order determines its
   * direction; set `largeArc` to select the complementary arc. Antipodal
   * endpoints produce the counter-clockwise semicircle by default and the
   * clockwise semicircle when `largeArc` is true.
   *
   * @param {object} options
   * @param {ArrayLike<number>|{x:number,y:number}} options.center circle center
   * @param {ArrayLike<number>|{x:number,y:number}} options.start arc start
   * @param {ArrayLike<number>|{x:number,y:number}} options.end arc end
   * @param {number} [options.segments=32] number of generated line segments
   * @param {boolean} [options.largeArc=false] select the complementary arc
   * @param {number} [options.hitTolerance=0.05] local picking tolerance
   * @returns {ArcOutlineGeometry}
   */
  static fromPoints(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(
        'ArcOutlineGeometry.fromPoints options must be an object',
      );
    }

    const {
      center: centerInput,
      start: startInput,
      end: endInput,
      segments = 32,
      largeArc = false,
      hitTolerance = 0.05,
    } = options;
    if (typeof largeArc !== 'boolean') {
      throw new TypeError(
        'ArcOutlineGeometry.fromPoints largeArc must be a boolean',
      );
    }

    const center = readPoint(
      centerInput,
      'center',
      'ArcOutlineGeometry.fromPoints',
    );
    const start = readPoint(
      startInput,
      'start',
      'ArcOutlineGeometry.fromPoints',
    );
    const end = readPoint(
      endInput,
      'end',
      'ArcOutlineGeometry.fromPoints',
    );
    const startX = start[0] - center[0];
    const startY = start[1] - center[1];
    const endX = end[0] - center[0];
    const endY = end[1] - center[1];
    const radius = Math.hypot(startX, startY);
    const endRadius = Math.hypot(endX, endY);

    if (!Number.isFinite(radius) || !Number.isFinite(endRadius)) {
      throw new RangeError(
        'ArcOutlineGeometry.fromPoints point offsets from center must be finite',
      );
    }
    if (radius === 0 || endRadius === 0) {
      throw new RangeError(
        'ArcOutlineGeometry.fromPoints start and end must differ from center',
      );
    }
    if (
      Math.abs(radius - endRadius) >
      Math.max(radius, endRadius) * RADIUS_RELATIVE_TOLERANCE
    ) {
      throw new RangeError(
        'ArcOutlineGeometry.fromPoints start and end must be the same distance from center',
      );
    }

    const startUnitX = startX / radius;
    const startUnitY = startY / radius;
    const endUnitX = endX / endRadius;
    const endUnitY = endY / endRadius;
    const cross = startUnitX * endUnitY - startUnitY * endUnitX;
    const dot = startUnitX * endUnitX + startUnitY * endUnitY;
    const startAngle = Math.atan2(startUnitY, startUnitX);
    let sweepAngle;
    if (Math.abs(cross) <= ANGULAR_TOLERANCE) {
      if (dot > 0) {
        throw new RangeError(
          'ArcOutlineGeometry.fromPoints start and end must define different directions from center',
        );
      }
      // atan2(+-0, -1) changes sign with floating-point noise. Choose a
      // deterministic semicircle; largeArc below selects its complement.
      sweepAngle = Math.PI;
    } else {
      sweepAngle = Math.atan2(cross, dot);
    }
    if (largeArc) sweepAngle += sweepAngle > 0 ? -TAU : TAU;
    const circleRadius = radius + (endRadius - radius) / 2;

    return new ArcOutlineGeometry(
      circleRadius,
      startAngle,
      sweepAngle,
      segments,
      { center, hitTolerance },
    );
  }

  /**
   * @param {number} radius radius in world units
   * @param {number} startAngle starting angle in radians
   * @param {number} sweepAngle signed angular span in radians; negative values
   *   run clockwise
   * @param {number} segments number of generated line segments
   * @param {object} [options]
   * @param {ArrayLike<number>|{x:number,y:number}} [options.center=[0,0]]
   *   local-space circle center
   * @param {number} [options.hitTolerance=0.05] local-space picking tolerance;
   *   this does not affect the rendered line width
   */
  constructor(
    radius = 0.5,
    startAngle = 0,
    sweepAngle = Math.PI,
    segments = 32,
    { center: centerInput = [0, 0], hitTolerance = 0.05 } = {},
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
    const center = readPoint(
      centerInput,
      'center',
      'ArcOutlineGeometry',
    );

    const vertices = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * sweepAngle;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      vertices.push(
        center[0] + radius * c,
        center[1] + radius * s,
        0.5 + c * 0.5,
        0.5 + s * 0.5,
      );
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
    this.center = center;
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

function readPoint(point, name, owner) {
  let x;
  let y;
  if (
    point !== null &&
    typeof point === 'object' &&
    'x' in point &&
    'y' in point
  ) {
    x = point.x;
    y = point.y;
  } else if (
    point !== null &&
    typeof point === 'object' &&
    typeof point[Symbol.iterator] === 'function'
  ) {
    [x, y] = point;
  } else {
    throw new TypeError(
      `${owner} ${name} must be an x/y point`,
    );
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError(
      `${owner} ${name} coordinates must be finite`,
    );
  }
  return [x, y];
}
