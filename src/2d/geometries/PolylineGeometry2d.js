import { Geometry2d, VERTEX_SIZE_2D } from './Geometry2d.js';
import { prepareTriangleGeometry } from '../../core/geometryData.js';

const JOIN_STYLES = new Set(['miter', 'bevel', 'round']);
const CAP_STYLES = new Set(['butt', 'square', 'round']);
const DIRECTION_EPSILON = 1e-10;

/**
 * A world-space thick polyline tessellated as a triangle list.
 *
 * Each segment is emitted as a quad and joins/caps fill its exposed ends. This
 * keeps acute turns and duplicate input points predictable without a clipping
 * dependency. Self-intersections and the inner side of sharp turns can
 * overlap, so translucent materials may accumulate alpha in those regions.
 */
export class PolylineGeometry2d extends Geometry2d {
  /**
   * @param {Array<Array<number>|{x:number,y:number}>|Array<number>|TypedArray}
   *   points nested `[x, y]`/`{ x, y }` points or a flat
   *   `[x0, y0, x1, y1, ...]` sequence
   * @param {number} thickness total stroke width in world units
   * @param {object} [options]
   * @param {boolean} [options.closed=false] connect the last point to the first
   * @param {'miter'|'bevel'|'round'} [options.join='miter'] corner style
   * @param {'butt'|'square'|'round'} [options.cap='butt'] open-end style;
   *   ignored by closed polylines
   * @param {number} [options.miterLimit=4] maximum miter length divided by
   *   half the stroke width; longer miters fall back to bevels
   * @param {number} [options.roundSegments=8] subdivisions per semicircle
   */
  constructor(
    points = [
      [-0.5, 0],
      [0.5, 0],
    ],
    thickness = 0.05,
    {
      closed = false,
      join = 'miter',
      cap = 'butt',
      miterLimit = 4,
      roundSegments = 8,
    } = {},
  ) {
    assertFinitePositive(
      thickness,
      'PolylineGeometry2d thickness must be a finite positive number',
    );
    if (!JOIN_STYLES.has(join)) {
      throw new RangeError(
        "PolylineGeometry2d join must be 'miter', 'bevel', or 'round'",
      );
    }
    if (!CAP_STYLES.has(cap)) {
      throw new RangeError(
        "PolylineGeometry2d cap must be 'butt', 'square', or 'round'",
      );
    }
    if (!Number.isFinite(miterLimit) || miterLimit < 1) {
      throw new RangeError(
        'PolylineGeometry2d miterLimit must be a finite number at least 1',
      );
    }
    roundSegments = normalizeRoundSegments(roundSegments);
    closed = Boolean(closed);
    points = normalizePoints(points, closed);

    const vertices = [];
    const indices = [];
    const halfThickness = thickness / 2;
    const segments = buildSegments(points, closed);
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const extendStart =
        !closed && cap === 'square' && i === 0 ? halfThickness : 0;
      const extendEnd =
        !closed && cap === 'square' && i === segments.length - 1
          ? halfThickness
          : 0;
      appendSegmentQuad(
        vertices,
        indices,
        segment,
        halfThickness,
        extendStart,
        extendEnd,
      );
    }

    const firstJoin = closed ? 0 : 1;
    const lastJoin = closed ? points.length : points.length - 1;
    for (let i = firstJoin; i < lastJoin; i++) {
      const previous = segments[(i - 1 + segments.length) % segments.length];
      const next = segments[i % segments.length];
      appendJoin(
        vertices,
        indices,
        points[i % points.length],
        previous,
        next,
        halfThickness,
        join,
        miterLimit,
        roundSegments,
      );
    }

    if (!closed && cap === 'round') {
      const first = segments[0];
      const last = segments.at(-1);
      appendFan(
        vertices,
        indices,
        first.start[0],
        first.start[1],
        Math.atan2(first.dy, first.dx) + Math.PI / 2,
        Math.PI,
        halfThickness,
        roundSegments,
      );
      appendFan(
        vertices,
        indices,
        last.end[0],
        last.end[1],
        Math.atan2(last.dy, last.dx) - Math.PI / 2,
        Math.PI,
        halfThickness,
        roundSegments,
      );
    }

    applyPlanarUvs(vertices);
    const vertexData = new Float32Array(vertices);
    const triangleIndices = removeCollapsedTriangles(vertexData, indices);
    if (triangleIndices.length === 0) {
      throw new RangeError(
        'PolylineGeometry2d thickness is too small for the point coordinate scale',
      );
    }
    const data = prepareTriangleGeometry(
      'PolylineGeometry2d',
      vertexData,
      triangleIndices,
      VERTEX_SIZE_2D,
      2,
    );
    super(data.vertices, data.indices);
    this.points = points.map((point) => point.slice());
    this.thickness = thickness;
    this.closed = closed;
    this.join = join;
    this.cap = cap;
    this.miterLimit = miterLimit;
    this.roundSegments = roundSegments;
  }

  /** Exact test against the generated triangle mesh. */
  containsPoint(x, y) {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      this.indices.length === 0
    ) {
      return false;
    }
    const { min, max } = this.bounds;
    if (x < min[0] || x > max[0] || y < min[1] || y > max[1]) return false;

    for (let i = 0; i < this.indices.length; i += 3) {
      const a = this.indices[i] * VERTEX_SIZE_2D;
      const b = this.indices[i + 1] * VERTEX_SIZE_2D;
      const c = this.indices[i + 2] * VERTEX_SIZE_2D;
      const ab = edgeSide(
        this.vertices[a],
        this.vertices[a + 1],
        this.vertices[b],
        this.vertices[b + 1],
        x,
        y,
      );
      const bc = edgeSide(
        this.vertices[b],
        this.vertices[b + 1],
        this.vertices[c],
        this.vertices[c + 1],
        x,
        y,
      );
      const ca = edgeSide(
        this.vertices[c],
        this.vertices[c + 1],
        this.vertices[a],
        this.vertices[a + 1],
        x,
        y,
      );
      const abTolerance = edgeSideTolerance(
        this.vertices[a],
        this.vertices[a + 1],
        this.vertices[b],
        this.vertices[b + 1],
        x,
        y,
      );
      const bcTolerance = edgeSideTolerance(
        this.vertices[b],
        this.vertices[b + 1],
        this.vertices[c],
        this.vertices[c + 1],
        x,
        y,
      );
      const caTolerance = edgeSideTolerance(
        this.vertices[c],
        this.vertices[c + 1],
        this.vertices[a],
        this.vertices[a + 1],
        x,
        y,
      );
      if (
        ab >= -abTolerance &&
        bc >= -bcTolerance &&
        ca >= -caTolerance
      ) {
        return true;
      }
    }
    return false;
  }
}

function normalizePoints(input, closed) {
  if (input == null || typeof input[Symbol.iterator] !== 'function') {
    throw new TypeError('PolylineGeometry2d points must be an iterable');
  }
  const values = Array.from(input);
  let points;

  if (values.length > 0 && typeof values[0] === 'number') {
    if (values.length % 2 !== 0) {
      throw new RangeError(
        'PolylineGeometry2d flat points must contain complete x/y pairs',
      );
    }
    points = [];
    for (let i = 0; i < values.length; i += 2) {
      points.push([values[i], values[i + 1]]);
    }
  } else {
    points = values.map((point) => {
      if (
        typeof point === 'object' &&
        point !== null &&
        'x' in point &&
        'y' in point
      ) {
        return [point.x, point.y];
      }
      if (point == null || typeof point[Symbol.iterator] !== 'function') {
        throw new TypeError(
          'PolylineGeometry2d each point must be an iterable x/y pair',
        );
      }
      const pair = Array.from(point);
      if (pair.length < 2) {
        throw new RangeError(
          'PolylineGeometry2d each point must contain x and y',
        );
      }
      return [pair[0], pair[1]];
    });
  }

  const deduplicated = [];
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new RangeError(
        'PolylineGeometry2d point coordinates must be finite numbers',
      );
    }
    if (!samePoint(point, deduplicated.at(-1))) deduplicated.push(point);
  }
  if (closed && samePoint(deduplicated[0], deduplicated.at(-1))) {
    deduplicated.pop();
  }

  const minimum = closed ? 3 : 2;
  if (deduplicated.length < minimum) {
    throw new RangeError(
      `PolylineGeometry2d ${closed ? 'closed' : 'open'} paths require at least ${minimum} distinct points`,
    );
  }
  return deduplicated;
}

function samePoint(a, b) {
  return (
    a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1]
  );
}

function buildSegments(points, closed) {
  const count = closed ? points.length : points.length - 1;
  const segments = [];
  for (let i = 0; i < count; i++) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    const offsetX = end[0] - start[0];
    const offsetY = end[1] - start[1];
    const length = Math.hypot(offsetX, offsetY);
    const dx = offsetX / length;
    const dy = offsetY / length;
    segments.push({ start, end, dx, dy, nx: -dy, ny: dx });
  }
  return segments;
}

function appendSegmentQuad(
  vertices,
  indices,
  segment,
  halfThickness,
  extendStart,
  extendEnd,
) {
  const startX = segment.start[0] - segment.dx * extendStart;
  const startY = segment.start[1] - segment.dy * extendStart;
  const endX = segment.end[0] + segment.dx * extendEnd;
  const endY = segment.end[1] + segment.dy * extendEnd;
  const offsetX = segment.nx * halfThickness;
  const offsetY = segment.ny * halfThickness;
  const base = vertices.length / VERTEX_SIZE_2D;

  pushVertex(vertices, startX - offsetX, startY - offsetY);
  pushVertex(vertices, endX - offsetX, endY - offsetY);
  pushVertex(vertices, endX + offsetX, endY + offsetY);
  pushVertex(vertices, startX + offsetX, startY + offsetY);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function appendJoin(
  vertices,
  indices,
  point,
  previous,
  next,
  halfThickness,
  join,
  miterLimit,
  roundSegments,
) {
  const cross = previous.dx * next.dy - previous.dy * next.dx;
  const dot = previous.dx * next.dx + previous.dy * next.dy;

  if (Math.abs(cross) <= DIRECTION_EPSILON) {
    if (dot < 0 && join === 'round') {
      appendFan(
        vertices,
        indices,
        point[0],
        point[1],
        0,
        Math.PI * 2,
        halfThickness,
        roundSegments * 2,
      );
    }
    return;
  }

  const turnAngle = Math.atan2(cross, dot);
  const outerSide = cross > 0 ? -1 : 1;
  const previousOuter = [
    point[0] + previous.nx * outerSide * halfThickness,
    point[1] + previous.ny * outerSide * halfThickness,
  ];
  const nextOuter = [
    point[0] + next.nx * outerSide * halfThickness,
    point[1] + next.ny * outerSide * halfThickness,
  ];

  if (join === 'round') {
    const segments = Math.max(
      1,
      Math.ceil((Math.abs(turnAngle) / Math.PI) * roundSegments),
    );
    appendFan(
      vertices,
      indices,
      point[0],
      point[1],
      Math.atan2(
        previousOuter[1] - point[1],
        previousOuter[0] - point[0],
      ),
      turnAngle,
      halfThickness,
      segments,
    );
    return;
  }

  if (join === 'miter') {
    const sumX = previous.nx + next.nx;
    const sumY = previous.ny + next.ny;
    const sumLength = Math.hypot(sumX, sumY);
    if (sumLength > DIRECTION_EPSILON) {
      const directionX = sumX / sumLength;
      const directionY = sumY / sumLength;
      const denominator = directionX * previous.nx + directionY * previous.ny;
      const scale = (outerSide * halfThickness) / denominator;
      const miterLength = Math.abs(scale);
      if (miterLength <= miterLimit * halfThickness) {
        const miter = [
          point[0] + directionX * scale,
          point[1] + directionY * scale,
        ];
        appendTriangle(vertices, indices, point, previousOuter, miter);
        appendTriangle(vertices, indices, point, miter, nextOuter);
        return;
      }
    }
  }

  appendTriangle(vertices, indices, point, previousOuter, nextOuter);
}

function appendFan(
  vertices,
  indices,
  centerX,
  centerY,
  startAngle,
  sweepAngle,
  radius,
  segments,
) {
  const center = vertices.length / VERTEX_SIZE_2D;
  pushVertex(vertices, centerX, centerY);
  const rim = vertices.length / VERTEX_SIZE_2D;
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (i / segments) * sweepAngle;
    pushVertex(
      vertices,
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
    );
  }
  for (let i = 0; i < segments; i++) {
    if (sweepAngle > 0) indices.push(center, rim + i, rim + i + 1);
    else indices.push(center, rim + i + 1, rim + i);
  }
}

function appendTriangle(vertices, indices, a, b, c) {
  const cross = edgeSide(a[0], a[1], b[0], b[1], c[0], c[1]);
  if (cross === 0) return;
  const base = vertices.length / VERTEX_SIZE_2D;
  pushVertex(vertices, a[0], a[1]);
  pushVertex(vertices, b[0], b[1]);
  pushVertex(vertices, c[0], c[1]);
  if (cross > 0) indices.push(base, base + 1, base + 2);
  else indices.push(base, base + 2, base + 1);
}

function removeCollapsedTriangles(vertices, indices) {
  const result = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * VERTEX_SIZE_2D;
    const b = indices[i + 1] * VERTEX_SIZE_2D;
    const c = indices[i + 2] * VERTEX_SIZE_2D;
    const cross = edgeSide(
      vertices[a],
      vertices[a + 1],
      vertices[b],
      vertices[b + 1],
      vertices[c],
      vertices[c + 1],
    );
    if (cross > 0) result.push(indices[i], indices[i + 1], indices[i + 2]);
    else if (cross < 0) {
      result.push(indices[i], indices[i + 2], indices[i + 1]);
    }
  }
  return result;
}

function pushVertex(vertices, x, y) {
  vertices.push(x, y, 0, 0);
}

function applyPlanarUvs(vertices) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < vertices.length; i += VERTEX_SIZE_2D) {
    minX = Math.min(minX, vertices[i]);
    minY = Math.min(minY, vertices[i + 1]);
    maxX = Math.max(maxX, vertices[i]);
    maxY = Math.max(maxY, vertices[i + 1]);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  for (let i = 0; i < vertices.length; i += VERTEX_SIZE_2D) {
    vertices[i + 2] = width === 0 ? 0.5 : (vertices[i] - minX) / width;
    vertices[i + 3] =
      height === 0 ? 0.5 : (vertices[i + 1] - minY) / height;
  }
}

function edgeSide(ax, ay, bx, by, x, y) {
  return (bx - ax) * (y - ay) - (by - ay) * (x - ax);
}

function edgeSideTolerance(ax, ay, bx, by, x, y) {
  return (
    Number.EPSILON *
    16 *
    (Math.abs((bx - ax) * (y - ay)) +
      Math.abs((by - ay) * (x - ax)))
  );
}

function assertFiniteNonNegative(value, message) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(message);
}

function assertFinitePositive(value, message) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(message);
}

function normalizeRoundSegments(roundSegments) {
  assertFiniteNonNegative(
    roundSegments,
    'PolylineGeometry2d roundSegments must be a finite non-negative number',
  );
  return Math.max(2, Math.floor(roundSegments));
}
