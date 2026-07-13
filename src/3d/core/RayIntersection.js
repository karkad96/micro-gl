import { forEachIndexedTriangle } from '../../core/indexedTriangles.js';
import { VERTEX_SIZE } from '../geometries/Geometry.js';

const POSITION_COMPONENTS = 3;
const PARALLEL_TRIANGLE_EPSILON = 1e-12;
const BARYCENTRIC_EPSILON = 1e-7;

/**
 * Returns the nearest local indexed-triangle hit distance, or `null`.
 * `direction` intentionally remains unnormalized: when it came from an
 * inverse-transformed unit world ray, the returned value is a world distance.
 */
export function intersectIndexedGeometry(
  origin,
  direction,
  geometry,
  topology,
  maxDistance,
) {
  if (!intersectsBounds(origin, direction, geometry.bounds, maxDistance)) {
    return null;
  }

  let nearestDistance = maxDistance;
  let hit = false;
  forEachIndexedTriangle(geometry.indices, topology, (a, b, c) => {
    const distance = intersectTriangle(
      origin,
      direction,
      geometry.vertices,
      a,
      b,
      c,
      nearestDistance,
    );
    if (distance === null) return false;
    nearestDistance = distance;
    hit = true;
    return distance === 0;
  });
  return hit ? nearestDistance : null;
}

/** Segment-vs-AABB broad phase over the ray interval [0, maxDistance]. */
export function intersectsBounds(origin, direction, bounds, maxDistance) {
  const min = bounds?.min;
  const max = bounds?.max;
  if (!hasFiniteBounds(min, max)) return false;

  let near = 0;
  let far = maxDistance;
  for (let axis = 0; axis < POSITION_COMPONENTS; axis++) {
    const component = componentAt(direction, axis);
    const start = componentAt(origin, axis);
    if (component === 0) {
      if (start < min[axis] || start > max[axis]) return false;
      continue;
    }

    let entry = (min[axis] - start) / component;
    let exit = (max[axis] - start) / component;
    if (entry > exit) [entry, exit] = [exit, entry];
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near > far) return false;
  }
  return far >= 0 && near <= maxDistance;
}

function intersectTriangle(
  origin,
  direction,
  vertices,
  indexA,
  indexB,
  indexC,
  maxDistance,
) {
  const offsetA = vertexOffset(vertices, indexA);
  const offsetB = vertexOffset(vertices, indexB);
  const offsetC = vertexOffset(vertices, indexC);
  if (offsetA < 0 || offsetB < 0 || offsetC < 0) return null;

  const ax = vertices[offsetA];
  const ay = vertices[offsetA + 1];
  const az = vertices[offsetA + 2];
  const edge1x = vertices[offsetB] - ax;
  const edge1y = vertices[offsetB + 1] - ay;
  const edge1z = vertices[offsetB + 2] - az;
  const edge2x = vertices[offsetC] - ax;
  const edge2y = vertices[offsetC + 1] - ay;
  const edge2z = vertices[offsetC + 2] - az;
  if (
    !Number.isFinite(ax) ||
    !Number.isFinite(ay) ||
    !Number.isFinite(az) ||
    !Number.isFinite(edge1x) ||
    !Number.isFinite(edge1y) ||
    !Number.isFinite(edge1z) ||
    !Number.isFinite(edge2x) ||
    !Number.isFinite(edge2y) ||
    !Number.isFinite(edge2z)
  ) {
    return null;
  }

  const px = direction.y * edge2z - direction.z * edge2y;
  const py = direction.z * edge2x - direction.x * edge2z;
  const pz = direction.x * edge2y - direction.y * edge2x;
  const determinant = edge1x * px + edge1y * py + edge1z * pz;
  const determinantScale =
    Math.hypot(edge1x, edge1y, edge1z) *
    Math.hypot(edge2x, edge2y, edge2z) *
    Math.hypot(direction.x, direction.y, direction.z);
  if (
    !Number.isFinite(determinantScale) ||
    determinantScale === 0 ||
    Math.abs(determinant) <=
      determinantScale * PARALLEL_TRIANGLE_EPSILON
  ) {
    return null;
  }

  const inverseDeterminant = 1 / determinant;
  const tx = origin.x - ax;
  const ty = origin.y - ay;
  const tz = origin.z - az;
  const u = (tx * px + ty * py + tz * pz) * inverseDeterminant;
  if (u < -BARYCENTRIC_EPSILON || u > 1 + BARYCENTRIC_EPSILON) {
    return null;
  }

  const qx = ty * edge1z - tz * edge1y;
  const qy = tz * edge1x - tx * edge1z;
  const qz = tx * edge1y - ty * edge1x;
  const v =
    (direction.x * qx + direction.y * qy + direction.z * qz) *
    inverseDeterminant;
  if (
    v < -BARYCENTRIC_EPSILON ||
    u + v > 1 + BARYCENTRIC_EPSILON
  ) {
    return null;
  }

  const distance =
    (edge2x * qx + edge2y * qy + edge2z * qz) * inverseDeterminant;
  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    distance > maxDistance
  ) {
    return null;
  }
  return distance;
}

function vertexOffset(vertices, index) {
  if (!Number.isInteger(index)) return -1;
  const offset = index * VERTEX_SIZE;
  return index >= 0 && offset + POSITION_COMPONENTS <= vertices.length
    ? offset
    : -1;
}

function hasFiniteBounds(min, max) {
  if (!min || !max || min.length < 3 || max.length < 3) return false;
  for (let axis = 0; axis < POSITION_COMPONENTS; axis++) {
    if (
      !Number.isFinite(min[axis]) ||
      !Number.isFinite(max[axis]) ||
      min[axis] > max[axis]
    ) {
      return false;
    }
  }
  return true;
}

function componentAt(vector, axis) {
  if (axis === 0) return vector.x;
  if (axis === 1) return vector.y;
  return vector.z;
}
