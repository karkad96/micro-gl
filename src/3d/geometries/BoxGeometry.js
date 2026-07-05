import { Geometry, VERTEX_SIZE } from './Geometry.js';

/**
 * An axis-aligned box centered on the origin, with flat-shaded faces
 * (24 vertices so each face gets its own normals and uvs).
 */
export class BoxGeometry extends Geometry {
  constructor(width = 1, height = 1, depth = 1) {
    const vertices = [];
    const indices = [];

    // u, v, w are the axis names each face maps its plane onto;
    // the sign of planeDepth picks which side of the box the face sits on.
    buildFace('z', 'y', 'x', -1, -1, depth, height, width, vertices, indices); // +X
    buildFace('z', 'y', 'x', 1, -1, depth, height, -width, vertices, indices); // -X
    buildFace('x', 'z', 'y', 1, 1, width, depth, height, vertices, indices); // +Y
    buildFace('x', 'z', 'y', 1, -1, width, depth, -height, vertices, indices); // -Y
    buildFace('x', 'y', 'z', 1, -1, width, height, depth, vertices, indices); // +Z
    buildFace('x', 'y', 'z', -1, -1, width, height, -depth, vertices, indices); // -Z

    super(vertices, indices);
  }
}

function buildFace(
  u,
  v,
  w,
  udir,
  vdir,
  planeWidth,
  planeHeight,
  planeDepth,
  vertices,
  indices,
) {
  const widthHalf = planeWidth / 2;
  const heightHalf = planeHeight / 2;
  const depthHalf = planeDepth / 2;
  const firstVertex = vertices.length / VERTEX_SIZE;

  for (let iy = 0; iy < 2; iy++) {
    const y = iy * planeHeight - heightHalf;
    for (let ix = 0; ix < 2; ix++) {
      const x = ix * planeWidth - widthHalf;

      const position = { x: 0, y: 0, z: 0 };
      position[u] = x * udir;
      position[v] = y * vdir;
      position[w] = depthHalf;

      const normal = { x: 0, y: 0, z: 0 };
      normal[w] = planeDepth > 0 ? 1 : -1;

      vertices.push(
        position.x,
        position.y,
        position.z,
        normal.x,
        normal.y,
        normal.z,
        ix,
        1 - iy,
      );
    }
  }

  const a = firstVertex;
  const b = firstVertex + 2;
  const c = firstVertex + 3;
  const d = firstVertex + 1;
  indices.push(a, b, d, b, c, d);
}
