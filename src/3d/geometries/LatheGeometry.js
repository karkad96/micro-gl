import { prepareTriangleGeometry } from '../../core/geometryData.js';
import { Geometry, VERTEX_SIZE } from './Geometry.js';
import { TAU, wrapAngle } from '../../math/angles.js';

/**
 * Revolves a 2D radius/Y profile around the local Y axis.
 *
 * Profile points may be `[radius, y]`, `{ x, y }`, or `{ radius, y }`.
 * List them from the lower end toward the upper end for outward-facing
 * normals. Partial sweeps leave their angular start and end boundaries open.
 */
export class LatheGeometry extends Geometry {
  /**
   * @param {Array<ArrayLike<number>|{x?: number, radius?: number, y: number}>} profilePoints
   * @param {number} [radialSegments=24] subdivisions around the Y axis
   * @param {{startAngle?: number, sweepAngle?: number}} [options]
   */
  constructor(profilePoints, radialSegments = 24, options = {}) {
    const profile = readProfile(profilePoints);
    validateSegments(radialSegments);
    validateOptions(options);

    const startAngle = options.startAngle ?? 0;
    const sweepAngle = options.sweepAngle ?? TAU;
    if (!Number.isFinite(startAngle)) {
      throw new RangeError('startAngle must be finite');
    }
    if (
      !Number.isFinite(sweepAngle) ||
      sweepAngle === 0 ||
      Math.abs(sweepAngle) > TAU
    ) {
      throw new RangeError(
        'sweepAngle magnitude must be greater than zero and at most 2 * Math.PI',
      );
    }
    const wrappedStartAngle = wrapAngle(startAngle);

    const profileNormals = buildProfileNormals(profile);
    const profileV = buildProfileCoordinates(profile);
    const vertices = [];
    const indices = [];

    for (let radial = 0; radial <= radialSegments; radial++) {
      const u = radial / radialSegments;
      const angle = wrappedStartAngle + sweepAngle * u;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);

      for (let row = 0; row < profile.length; row++) {
        const { radius, y } = profile[row];
        const [normalRadius, normalY] = profileNormals[row];
        vertices.push(
          radius * cosine,
          y,
          radius * sine,
          normalRadius * cosine,
          normalY,
          normalRadius * sine,
          u,
          profileV[row],
        );
      }
    }

    const rowSize = profile.length;
    const positiveSweep = sweepAngle > 0;
    for (let radial = 0; radial < radialSegments; radial++) {
      for (let row = 0; row < profile.length - 1; row++) {
        const a = radial * rowSize + row;
        const b = (radial + 1) * rowSize + row;
        const c = b + 1;
        const d = a + 1;

        if (profile[row].radius > 0) {
          if (positiveSweep) indices.push(a, c, b);
          else indices.push(a, b, c);
        }
        if (profile[row + 1].radius > 0) {
          if (positiveSweep) indices.push(a, d, c);
          else indices.push(a, c, d);
        }
      }
    }

    const data = prepareTriangleGeometry(
      'LatheGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}

function validateSegments(radialSegments) {
  if (!Number.isInteger(radialSegments) || radialSegments < 3) {
    throw new RangeError('radialSegments must be an integer of at least 3');
  }
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
}

function readProfile(profilePoints) {
  if (!Array.isArray(profilePoints) || profilePoints.length < 2) {
    throw new TypeError('profilePoints must be an array of at least two points');
  }

  const profile = profilePoints.map((point, index) => {
    const arrayPoint = Array.isArray(point) || ArrayBuffer.isView(point);
    const radius = arrayPoint ? point[0] : point?.radius ?? point?.x;
    const y = arrayPoint ? point[1] : point?.y;
    if (!Number.isFinite(radius) || !Number.isFinite(y)) {
      throw new RangeError(`profile point ${index} must contain finite coordinates`);
    }
    if (radius < 0) {
      throw new RangeError(`profile point ${index} radius must be non-negative`);
    }
    return { radius, y };
  });

  let hasSurface = false;
  for (let i = 1; i < profile.length; i++) {
    const previous = profile[i - 1];
    const current = profile[i];
    if (previous.radius === current.radius && previous.y === current.y) {
      throw new RangeError(`profile points ${i - 1} and ${i} must be distinct`);
    }
    if (previous.radius > 0 || current.radius > 0) hasSurface = true;
  }
  if (!hasSurface) {
    throw new RangeError('profile must extend away from the Y axis');
  }
  return profile;
}

function buildProfileNormals(profile) {
  const segmentNormals = [];
  for (let i = 0; i < profile.length - 1; i++) {
    if (profile[i].radius === 0 && profile[i + 1].radius === 0) {
      segmentNormals.push(null);
      continue;
    }
    const radiusDelta = profile[i + 1].radius - profile[i].radius;
    const yDelta = profile[i + 1].y - profile[i].y;
    const length = Math.hypot(radiusDelta, yDelta);
    segmentNormals.push([yDelta / length, -radiusDelta / length]);
  }

  return profile.map((_, index) => {
    const previous = index > 0 ? segmentNormals[index - 1] : null;
    const next = index < segmentNormals.length ? segmentNormals[index] : null;
    if (!previous && !next) return nearestSurfaceNormal(segmentNormals, index);
    if (!previous) return next;
    if (!next) return previous;

    let radius = previous[0] + next[0];
    let y = previous[1] + next[1];
    const length = Math.hypot(radius, y);
    if (length === 0) return next;
    radius /= length;
    y /= length;
    return [radius, y];
  });
}

function nearestSurfaceNormal(segmentNormals, profileIndex) {
  for (let distance = 1; distance <= segmentNormals.length; distance++) {
    const previous = segmentNormals[profileIndex - distance];
    if (previous) return previous;
    const next = segmentNormals[profileIndex + distance - 1];
    if (next) return next;
  }
  return [0, 1];
}

function buildProfileCoordinates(profile) {
  const coordinates = [0];
  let totalLength = 0;
  for (let i = 1; i < profile.length; i++) {
    totalLength += Math.hypot(
      profile[i].radius - profile[i - 1].radius,
      profile[i].y - profile[i - 1].y,
    );
    coordinates.push(totalLength);
  }
  for (let i = 1; i < coordinates.length; i++) {
    coordinates[i] /= totalLength;
  }
  return coordinates;
}
