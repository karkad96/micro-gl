import { Geometry, VERTEX_SIZE } from './Geometry.js';
import { prepareTriangleGeometry } from '../../core/geometryData.js';

const TAU = Math.PI * 2;
const PARALLEL_EPSILON = 1e-10;
const REVERSAL_EPSILON = 1e-6;

/**
 * A circular tube following a piecewise-linear 3D path.
 *
 * The side rings use parallel-transported frames, avoiding the flips caused by
 * choosing a fresh up vector at every point. Closed paths distribute their
 * accumulated frame twist around the loop and duplicate the first ring for a
 * continuous UV seam. Very sharp bends or a radius larger than the local bend
 * can still make the surface self-intersect.
 */
export class TubeGeometry extends Geometry {
  /**
   * @param {Array<ArrayLike<number>|{x: number, y: number, z: number}>} pathPoints
   * @param {number} [radius=0.1] tube radius
   * @param {number} [radialSegments=8] subdivisions around each ring
   * @param {{closed?: boolean, cap?: boolean}} [options]
   */
  constructor(pathPoints, radius = 0.1, radialSegments = 8, options = {}) {
    validateOptions(options);
    const closed = options.closed ?? false;
    if (typeof closed !== 'boolean') {
      throw new TypeError('closed must be a boolean');
    }
    const cap = options.cap ?? !closed;
    if (typeof cap !== 'boolean') {
      throw new TypeError('cap must be a boolean');
    }
    if (closed && cap) {
      throw new RangeError('a closed tube cannot also have end caps');
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError('radius must be a positive finite number');
    }
    if (!Number.isInteger(radialSegments) || radialSegments < 3) {
      throw new RangeError('radialSegments must be an integer of at least 3');
    }

    const points = readPath(pathPoints, closed);
    const directions = buildSegmentDirections(points, closed);
    const tangents = buildTangents(directions, closed);
    const frames = buildFrames(tangents, closed);
    const ringCount = closed ? points.length + 1 : points.length;
    const pathCoordinates = buildPathCoordinates(points, ringCount);
    const vertices = [];
    const indices = [];

    for (let ring = 0; ring < ringCount; ring++) {
      const point = points[ring % points.length];
      const normal = frames.normals[ring];
      const binormal = frames.binormals[ring];
      for (let radial = 0; radial <= radialSegments; radial++) {
        const v = radial / radialSegments;
        const angle = v * TAU;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const nx = normal[0] * cosine + binormal[0] * sine;
        const ny = normal[1] * cosine + binormal[1] * sine;
        const nz = normal[2] * cosine + binormal[2] * sine;
        vertices.push(
          point[0] + nx * radius,
          point[1] + ny * radius,
          point[2] + nz * radius,
          nx,
          ny,
          nz,
          pathCoordinates[ring],
          v,
        );
      }
    }

    const ringStride = radialSegments + 1;
    const segmentCount = closed ? points.length : points.length - 1;
    for (let segment = 0; segment < segmentCount; segment++) {
      for (let radial = 0; radial < radialSegments; radial++) {
        const a = segment * ringStride + radial;
        const b = (segment + 1) * ringStride + radial;
        const c = b + 1;
        const d = a + 1;
        indices.push(a, c, b, a, d, c);
      }
    }

    if (cap) {
      appendCap(
        vertices,
        indices,
        points[0],
        tangents[0],
        frames.normals[0],
        frames.binormals[0],
        radius,
        radialSegments,
        false,
      );
      const last = points.length - 1;
      appendCap(
        vertices,
        indices,
        points[last],
        tangents[last],
        frames.normals[last],
        frames.binormals[last],
        radius,
        radialSegments,
        true,
      );
    }

    const data = prepareTriangleGeometry(
      'TubeGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
}

function readPath(pathPoints, closed) {
  if (!Array.isArray(pathPoints)) {
    throw new TypeError('pathPoints must be an array');
  }
  const points = pathPoints.map((point, index) => {
    const arrayPoint = Array.isArray(point) || ArrayBuffer.isView(point);
    const x = arrayPoint ? point[0] : point?.x;
    const y = arrayPoint ? point[1] : point?.y;
    const z = arrayPoint ? point[2] : point?.z;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new RangeError(`path point ${index} must contain finite coordinates`);
    }
    return [x, y, z];
  });

  if (closed && points.length > 1 && equalPoint(points[0], points.at(-1))) {
    points.pop();
  }
  const minimumPoints = closed ? 3 : 2;
  if (points.length < minimumPoints) {
    throw new RangeError(
      `pathPoints must contain at least ${minimumPoints} distinct points`,
    );
  }
  return points;
}

function buildSegmentDirections(points, closed) {
  const segmentCount = closed ? points.length : points.length - 1;
  const directions = [];
  for (let i = 0; i < segmentCount; i++) {
    const direction = subtract(points[(i + 1) % points.length], points[i]);
    const length = vectorLength(direction);
    if (length === 0) {
      throw new RangeError(`path segment ${i} must have non-zero length`);
    }
    directions.push(scale(direction, 1 / length));
  }
  return directions;
}

function buildTangents(directions, closed) {
  const pointCount = closed ? directions.length : directions.length + 1;
  const tangents = [];
  for (let i = 0; i < pointCount; i++) {
    if (!closed && i === 0) {
      tangents.push(directions[0]);
      continue;
    }
    if (!closed && i === pointCount - 1) {
      tangents.push(directions.at(-1));
      continue;
    }

    const previous = directions[(i - 1 + directions.length) % directions.length];
    const next = directions[i % directions.length];
    const tangent = add(previous, next);
    const length = vectorLength(tangent);
    if (length < REVERSAL_EPSILON) {
      throw new RangeError(`path reverses direction at point ${i}`);
    }
    tangents.push(scale(tangent, 1 / length));
  }
  return tangents;
}

function buildFrames(tangents, closed) {
  const frameTangents = closed ? [...tangents, tangents[0]] : tangents;
  const normals = [choosePerpendicular(frameTangents[0])];
  for (let i = 1; i < frameTangents.length; i++) {
    normals.push(
      transportNormal(normals[i - 1], frameTangents[i - 1], frameTangents[i]),
    );
  }

  if (closed) {
    const last = normals.length - 1;
    const correction = signedAngle(
      normals[last],
      normals[0],
      frameTangents[0],
    );
    for (let i = 1; i <= last; i++) {
      normals[i] = normalize(
        rotateAroundAxis(
          normals[i],
          frameTangents[i],
          (correction * i) / last,
        ),
      );
    }
  }

  const binormals = normals.map((normal, index) =>
    normalize(cross(frameTangents[index], normal)),
  );
  return { normals, binormals };
}

function choosePerpendicular(tangent) {
  const absolute = tangent.map(Math.abs);
  let reference;
  if (absolute[0] <= absolute[1] && absolute[0] <= absolute[2]) {
    reference = [1, 0, 0];
  } else if (absolute[1] <= absolute[2]) {
    reference = [0, 1, 0];
  } else {
    reference = [0, 0, 1];
  }
  return normalize(cross(tangent, reference));
}

function transportNormal(normal, fromTangent, toTangent) {
  const axis = cross(fromTangent, toTangent);
  const sine = vectorLength(axis);
  let transported = normal;
  if (sine > PARALLEL_EPSILON) {
    const unitAxis = scale(axis, 1 / sine);
    const cosine = Math.max(-1, Math.min(1, dot(fromTangent, toTangent)));
    transported = add(
      add(scale(normal, cosine), scale(cross(unitAxis, normal), sine)),
      scale(unitAxis, dot(unitAxis, normal) * (1 - cosine)),
    );
  }

  const projected = subtract(
    transported,
    scale(toTangent, dot(transported, toTangent)),
  );
  return vectorLength(projected) > PARALLEL_EPSILON
    ? normalize(projected)
    : choosePerpendicular(toTangent);
}

function buildPathCoordinates(points, ringCount) {
  const coordinates = [0];
  let totalLength = 0;
  for (let i = 1; i < ringCount; i++) {
    totalLength += vectorLength(
      subtract(points[i % points.length], points[(i - 1) % points.length]),
    );
    coordinates.push(totalLength);
  }
  for (let i = 1; i < coordinates.length; i++) {
    coordinates[i] /= totalLength;
  }
  return coordinates;
}

function appendCap(
  vertices,
  indices,
  point,
  tangent,
  normal,
  binormal,
  radius,
  radialSegments,
  atEnd,
) {
  const normalSign = atEnd ? 1 : -1;
  const center = vertices.length / VERTEX_SIZE;
  vertices.push(
    point[0],
    point[1],
    point[2],
    tangent[0] * normalSign,
    tangent[1] * normalSign,
    tangent[2] * normalSign,
    0.5,
    0.5,
  );
  const ringStart = vertices.length / VERTEX_SIZE;
  for (let radial = 0; radial < radialSegments; radial++) {
    const angle = (radial / radialSegments) * TAU;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const offset = add(scale(normal, cosine), scale(binormal, sine));
    vertices.push(
      point[0] + offset[0] * radius,
      point[1] + offset[1] * radius,
      point[2] + offset[2] * radius,
      tangent[0] * normalSign,
      tangent[1] * normalSign,
      tangent[2] * normalSign,
      0.5 + cosine * 0.5,
      0.5 + sine * 0.5,
    );
  }

  for (let radial = 0; radial < radialSegments; radial++) {
    const current = ringStart + radial;
    const next = ringStart + ((radial + 1) % radialSegments);
    if (atEnd) indices.push(center, current, next);
    else indices.push(center, next, current);
  }
}

function equalPoint(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector, scalar) {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vectorLength(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector) {
  const length = vectorLength(vector);
  return scale(vector, 1 / length);
}

function rotateAroundAxis(vector, axis, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    add(scale(vector, cosine), scale(cross(axis, vector), sine)),
    scale(axis, dot(axis, vector) * (1 - cosine)),
  );
}

function signedAngle(from, to, axis) {
  return Math.atan2(dot(axis, cross(from, to)), dot(from, to));
}
