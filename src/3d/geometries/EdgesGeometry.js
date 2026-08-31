import { Geometry, VERTEX_SIZE } from './Geometry.js';

const DEFAULT_THRESHOLD_ANGLE = 1;
const MAX_THRESHOLD_ANGLE = 180;
const WELD_RELATIVE_TOLERANCE = 1e-7;

/**
 * Extracts the visible feature edges of an indexed triangle-list geometry.
 *
 * Vertices at the same position are welded before triangle adjacency is
 * calculated, so UV and normal seams do not create duplicate lines. Boundary
 * edges are always kept. An edge shared by several triangles is kept when at
 * least two face normals meet at `thresholdAngle` degrees or more; coplanar
 * triangle diagonals are therefore omitted with the default threshold.
 *
 * Draw the result with a material whose topology is `'line-list'`.
 */
export class EdgesGeometry extends Geometry {
  /**
   * @param {Geometry} source indexed triangle-list geometry
   * @param {number} [thresholdAngle=1] minimum crease angle in degrees
   */
  constructor(source, thresholdAngle = DEFAULT_THRESHOLD_ANGLE) {
    validateSource(source);
    if (
      !Number.isFinite(thresholdAngle) ||
      thresholdAngle < 0 ||
      thresholdAngle > MAX_THRESHOLD_ANGLE
    ) {
      throw new RangeError('thresholdAngle must be between 0 and 180 degrees');
    }

    const { vertices, sourceToWelded } = weldVertices(source.vertices);
    const edgeMap = new Map();

    for (let i = 0; i < source.indices.length; i += 3) {
      const a = sourceToWelded[source.indices[i]];
      const b = sourceToWelded[source.indices[i + 1]];
      const c = sourceToWelded[source.indices[i + 2]];
      const normal = triangleNormal(vertices, a, b, c);
      if (!normal) continue;

      appendFace(edgeMap, a, b, normal);
      appendFace(edgeMap, b, c, normal);
      appendFace(edgeMap, c, a, normal);
    }

    const thresholdDot = Math.cos((thresholdAngle * Math.PI) / 180);
    const indices = [];
    for (const edge of edgeMap.values()) {
      if (
        edge.normals.length === 1 ||
        hasSharpNormalPair(edge.normals, thresholdDot)
      ) {
        indices.push(edge.a, edge.b);
      }
    }

    super(vertices, indices);
  }
}

function validateSource(source) {
  if (!source || !source.vertices || !source.indices) {
    throw new TypeError('source must provide vertices and indices');
  }
  if (source.vertices.length === 0 || source.vertices.length % VERTEX_SIZE !== 0) {
    throw new RangeError(
      `source vertices must contain complete ${VERTEX_SIZE}-float records`,
    );
  }
  if (source.indices.length === 0 || source.indices.length % 3 !== 0) {
    throw new RangeError('source indices must contain complete triangles');
  }

  for (let i = 0; i < source.vertices.length; i++) {
    if (!Number.isFinite(source.vertices[i])) {
      throw new RangeError(`source vertex component ${i} must be finite`);
    }
  }

  const vertexCount = source.vertices.length / VERTEX_SIZE;
  for (let i = 0; i < source.indices.length; i++) {
    const index = source.indices[i];
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError(`source index ${i} is outside the vertex array`);
    }
  }
}

function weldVertices(source) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < source.length; i += VERTEX_SIZE) {
    minX = Math.min(minX, source[i]);
    minY = Math.min(minY, source[i + 1]);
    minZ = Math.min(minZ, source[i + 2]);
    maxX = Math.max(maxX, source[i]);
    maxY = Math.max(maxY, source[i + 1]);
    maxZ = Math.max(maxZ, source[i + 2]);
  }

  const extents = [maxX - minX, maxY - minY, maxZ - minZ];
  const minimums = [minX, minY, minZ];
  const weldedByPosition = new Map();
  const sourceToWelded = new Uint32Array(source.length / VERTEX_SIZE);
  const vertices = [];

  for (let offset = 0; offset < source.length; offset += VERTEX_SIZE) {
    const x = source[offset];
    const y = source[offset + 1];
    const z = source[offset + 2];
    const key = [x, y, z]
      .map((component, axis) =>
        quantizePosition(component, minimums[axis], extents[axis]),
      )
      .join(',');
    let weldedIndex = weldedByPosition.get(key);
    if (weldedIndex === undefined) {
      weldedIndex = vertices.length / VERTEX_SIZE;
      weldedByPosition.set(key, weldedIndex);

      let nx = source[offset + 3];
      let ny = source[offset + 4];
      let nz = source[offset + 5];
      const normalLength = Math.hypot(nx, ny, nz);
      if (normalLength > 0) {
        nx /= normalLength;
        ny /= normalLength;
        nz /= normalLength;
      } else {
        nx = 0;
        ny = 0;
        nz = 1;
      }
      vertices.push(
        x,
        y,
        z,
        nx,
        ny,
        nz,
        source[offset + 6],
        source[offset + 7],
      );
    }
    sourceToWelded[offset / VERTEX_SIZE] = weldedIndex;
  }

  return { vertices, sourceToWelded };
}

function quantizePosition(value, minimum, extent) {
  if (extent === 0) return 0;
  return Math.round(
    (value - minimum) / (extent * WELD_RELATIVE_TOLERANCE),
  );
}

function triangleNormal(vertices, a, b, c) {
  if (a === b || b === c || c === a) return null;
  const offsetA = a * VERTEX_SIZE;
  const offsetB = b * VERTEX_SIZE;
  const offsetC = c * VERTEX_SIZE;
  const abx = vertices[offsetB] - vertices[offsetA];
  const aby = vertices[offsetB + 1] - vertices[offsetA + 1];
  const abz = vertices[offsetB + 2] - vertices[offsetA + 2];
  const acx = vertices[offsetC] - vertices[offsetA];
  const acy = vertices[offsetC + 1] - vertices[offsetA + 1];
  const acz = vertices[offsetC + 2] - vertices[offsetA + 2];
  let nx = aby * acz - abz * acy;
  let ny = abz * acx - abx * acz;
  let nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz);
  if (length === 0) return null;
  nx /= length;
  ny /= length;
  nz /= length;
  return [nx, ny, nz];
}

function appendFace(edgeMap, a, b, normal) {
  if (a === b) return;
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  const key = `${low},${high}`;
  let edge = edgeMap.get(key);
  if (!edge) {
    edge = { a: low, b: high, normals: [] };
    edgeMap.set(key, edge);
  }
  edge.normals.push(normal);
}

function hasSharpNormalPair(normals, thresholdDot) {
  for (let i = 0; i < normals.length; i++) {
    for (let j = i + 1; j < normals.length; j++) {
      const dot =
        normals[i][0] * normals[j][0] +
        normals[i][1] * normals[j][1] +
        normals[i][2] * normals[j][2];
      if (dot <= thresholdDot) return true;
    }
  }
  return false;
}
