import { Geometry, VERTEX_SIZE } from './Geometry.js';
import { prepareTriangleGeometry } from '../../core/geometryData.js';

/**
 * Extrudes one simple 2D polygon along the local Z axis.
 *
 * Concave polygons are triangulated with ear clipping. Clockwise input is
 * accepted and normalized internally. The front and back caps have planar
 * UVs, while each side edge gets its own four vertices for a flat outward
 * normal. Holes, bevels, and self-intersecting polygons are not supported.
 */
export class ExtrudeGeometry extends Geometry {
  /**
   * @param {Array<ArrayLike<number>|{x: number, y: number}>} polygonPoints
   * @param {number} [depth=1] total extrusion depth, centered on Z = 0
   */
  constructor(polygonPoints, depth = 1) {
    if (!Number.isFinite(depth) || depth <= 0) {
      throw new RangeError('depth must be a positive finite number');
    }

    const polygon = preparePolygon(polygonPoints);
    const capTriangles = triangulate(polygon.points);
    const halfDepth = depth / 2;
    const vertices = [];
    const indices = [];

    for (const point of polygon.points) {
      const u = (point[0] - polygon.minX) / polygon.width;
      const v = (point[1] - polygon.minY) / polygon.height;
      vertices.push(point[0], point[1], halfDepth, 0, 0, 1, u, v);
    }
    const backOffset = vertices.length / VERTEX_SIZE;
    for (const point of polygon.points) {
      const u = (point[0] - polygon.minX) / polygon.width;
      const v = (point[1] - polygon.minY) / polygon.height;
      vertices.push(point[0], point[1], -halfDepth, 0, 0, -1, u, v);
    }

    for (let i = 0; i < capTriangles.length; i += 3) {
      const a = capTriangles[i];
      const b = capTriangles[i + 1];
      const c = capTriangles[i + 2];
      indices.push(a, b, c);
      indices.push(backOffset + a, backOffset + c, backOffset + b);
    }

    const sideCoordinates = buildSideCoordinates(polygon.points);
    for (let i = 0; i < polygon.points.length; i++) {
      const next = (i + 1) % polygon.points.length;
      const start = polygon.points[i];
      const end = polygon.points[next];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const edgeLength = Math.hypot(dx, dy);
      const nx = dy / edgeLength;
      const ny = -dx / edgeLength;
      const base = vertices.length / VERTEX_SIZE;
      const startU = sideCoordinates[i];
      const endU = sideCoordinates[i + 1];

      vertices.push(start[0], start[1], -halfDepth, nx, ny, 0, startU, 0);
      vertices.push(end[0], end[1], -halfDepth, nx, ny, 0, endU, 0);
      vertices.push(end[0], end[1], halfDepth, nx, ny, 0, endU, 1);
      vertices.push(start[0], start[1], halfDepth, nx, ny, 0, startU, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const data = prepareTriangleGeometry(
      'ExtrudeGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}

function preparePolygon(polygonPoints) {
  if (!Array.isArray(polygonPoints)) {
    throw new TypeError('polygonPoints must be an array');
  }

  const points = polygonPoints.map((point, index) => {
    const arrayPoint = Array.isArray(point) || ArrayBuffer.isView(point);
    const x = arrayPoint ? point[0] : point?.x;
    const y = arrayPoint ? point[1] : point?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError(`polygon point ${index} must contain finite coordinates`);
    }

    // Geometry ultimately stores positions as Float32. Quantize once before
    // validating topology so every predicate sees the same coordinates that
    // rendering and raycasting will use. Double precision is then ample for
    // products of Float32 differences without a scale-wide epsilon that can
    // collapse a valid thin polygon beside a very long edge.
    const floatX = Math.fround(x);
    const floatY = Math.fround(y);
    if (!Number.isFinite(floatX) || !Number.isFinite(floatY)) {
      throw new RangeError(
        `polygon point ${index} must contain finite Float32 coordinates`,
      );
    }
    return [floatX, floatY];
  });

  if (points.length > 1 && equalPoint(points[0], points.at(-1))) points.pop();
  if (points.length < 3) {
    throw new RangeError('polygonPoints must contain at least three points');
  }

  validateDistinctPoints(points);
  validateSimplePolygon(points);
  removeCollinearPoints(points);

  if (points.length < 3) {
    throw new RangeError('polygon must contain at least three non-collinear points');
  }
  const bounds = polygonBounds(points);
  const area = signedArea(points);
  if (area === 0) {
    throw new RangeError('polygon area must be non-zero');
  }
  if (area < 0) points.reverse();

  return {
    points,
    minX: bounds.minX,
    minY: bounds.minY,
    width: bounds.width,
    height: bounds.height,
  };
}

function polygonBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function validateDistinctPoints(points) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (equalPoint(points[i], points[j])) {
        throw new RangeError(`polygon points ${i} and ${j} must be distinct`);
      }
    }
  }
}

function validateSimplePolygon(points) {
  for (let i = 0; i < points.length; i++) {
    const nextI = (i + 1) % points.length;
    for (let j = i + 1; j < points.length; j++) {
      const nextJ = (j + 1) % points.length;
      if (i === j || nextI === j || nextJ === i) continue;
      if (segmentsIntersect(points[i], points[nextI], points[j], points[nextJ])) {
        throw new RangeError('polygon must not self-intersect');
      }
    }
  }
}

function removeCollinearPoints(points) {
  let removed = true;
  while (removed && points.length > 3) {
    removed = false;
    for (let i = 0; i < points.length; i++) {
      const previous = points[(i - 1 + points.length) % points.length];
      const current = points[i];
      const next = points[(i + 1) % points.length];
      if (
        cross2(previous, current, next) === 0 &&
        dot2(subtract2(current, previous), subtract2(current, next)) <= 0
      ) {
        points.splice(i, 1);
        removed = true;
        break;
      }
    }
  }
}

function triangulate(points) {
  const remaining = points.map((_, index) => index);
  const triangles = [];

  while (remaining.length > 3) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const previous = remaining[(i - 1 + remaining.length) % remaining.length];
      const current = remaining[i];
      const next = remaining[(i + 1) % remaining.length];
      if (cross2(points[previous], points[current], points[next]) <= 0) {
        continue;
      }

      let containsPoint = false;
      for (const candidate of remaining) {
        if (candidate === previous || candidate === current || candidate === next) {
          continue;
        }
        if (
          pointInTriangle(
            points[candidate],
            points[previous],
            points[current],
            points[next],
          )
        ) {
          containsPoint = true;
          break;
        }
      }
      if (containsPoint) continue;

      triangles.push(previous, current, next);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      throw new RangeError('polygon could not be triangulated');
    }
  }

  triangles.push(remaining[0], remaining[1], remaining[2]);
  return triangles;
}

function buildSideCoordinates(points) {
  const coordinates = [0];
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    perimeter += distance(points[i], points[(i + 1) % points.length]);
    coordinates.push(perimeter);
  }
  for (let i = 1; i < coordinates.length; i++) {
    coordinates[i] /= perimeter;
  }
  return coordinates;
}

function segmentsIntersect(a, b, c, d) {
  const abc = cross2(a, b, c);
  const abd = cross2(a, b, d);
  const cda = cross2(c, d, a);
  const cdb = cross2(c, d, b);
  if (
    ((abc > 0 && abd < 0) || (abc < 0 && abd > 0)) &&
    ((cda > 0 && cdb < 0) || (cda < 0 && cdb > 0))
  ) {
    return true;
  }
  return (
    (abc === 0 && onSegment(a, b, c)) ||
    (abd === 0 && onSegment(a, b, d)) ||
    (cda === 0 && onSegment(c, d, a)) ||
    (cdb === 0 && onSegment(c, d, b))
  );
}

function onSegment(a, b, point) {
  return (
    point[0] >= Math.min(a[0], b[0]) &&
    point[0] <= Math.max(a[0], b[0]) &&
    point[1] >= Math.min(a[1], b[1]) &&
    point[1] <= Math.max(a[1], b[1])
  );
}

function pointInTriangle(point, a, b, c) {
  return (
    cross2(a, b, point) >= 0 &&
    cross2(b, c, point) >= 0 &&
    cross2(c, a, point) >= 0
  );
}

function signedArea(points) {
  let twiceArea = 0;
  const origin = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const next = points[(i + 1) % points.length];
    twiceArea += cross2(origin, points[i], next);
  }
  return twiceArea / 2;
}

function cross2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
}

function subtract2(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

function dot2(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function equalPoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
