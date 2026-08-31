/**
 * Converts generated geometry to its GPU representation and rejects values
 * or primitives that collapse during Float32 conversion.
 */
export function prepareTriangleGeometry(
  owner,
  vertices,
  indices,
  vertexSize,
  dimensions,
) {
  const data = prepareGeometryData(owner, vertices, indices);
  for (let i = 0; i < data.indices.length; i += 3) {
    const a = data.indices[i] * vertexSize;
    const b = data.indices[i + 1] * vertexSize;
    const c = data.indices[i + 2] * vertexSize;
    if (triangleCollapsed(data.vertices, a, b, c, dimensions)) {
      throw new RangeError(
        `${owner} parameters produce a triangle that collapses in Float32`,
      );
    }
  }
  return data;
}

/** Float32 conversion and representability check for generated line lists. */
export function prepareLineGeometry(
  owner,
  vertices,
  indices,
  vertexSize,
  dimensions,
) {
  const data = prepareGeometryData(owner, vertices, indices);
  for (let i = 0; i < data.indices.length; i += 2) {
    const a = data.indices[i] * vertexSize;
    const b = data.indices[i + 1] * vertexSize;
    let identical = true;
    for (let axis = 0; axis < dimensions; axis++) {
      if (data.vertices[a + axis] !== data.vertices[b + axis]) {
        identical = false;
        break;
      }
    }
    if (identical) {
      throw new RangeError(
        `${owner} parameters produce a line that collapses in Float32`,
      );
    }
  }
  return data;
}

function prepareGeometryData(owner, vertices, indices) {
  const vertexData =
    vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
  for (let i = 0; i < vertexData.length; i++) {
    if (!Number.isFinite(vertexData[i])) {
      throw new RangeError(
        `${owner} parameters produce vertex data outside the Float32 range`,
      );
    }
  }
  return {
    vertices: vertexData,
    indices:
      indices instanceof Uint32Array ? indices : new Uint32Array(indices),
  };
}

function triangleCollapsed(vertices, a, b, c, dimensions) {
  const abx = vertices[b] - vertices[a];
  const aby = vertices[b + 1] - vertices[a + 1];
  const acx = vertices[c] - vertices[a];
  const acy = vertices[c + 1] - vertices[a + 1];
  if (dimensions === 2) return abx * acy - aby * acx === 0;

  const abz = vertices[b + 2] - vertices[a + 2];
  const acz = vertices[c + 2] - vertices[a + 2];
  return (
    aby * acz - abz * acy === 0 &&
    abz * acx - abx * acz === 0 &&
    abx * acy - aby * acx === 0
  );
}
