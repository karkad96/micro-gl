import { Geometry, VERTEX_SIZE } from './Geometry.js';

/**
 * An axis-aligned box centered on the origin, with flat-shaded faces
 * (24 vertices so each face gets its own normals and uvs).
 *
 * Each face is described by the corner where its uvs are (0, 0) plus
 * the two edges the u and v axes run along; the outward normal falls
 * out as edgeU x edgeV, which is also what makes the triangles wind
 * counter-clockwise seen from outside.
 */
export class BoxGeometry extends Geometry {
  constructor(width = 1, height = 1, depth = 1) {
    const x = width / 2;
    const y = height / 2;
    const z = depth / 2;

    // prettier-ignore
    const faces = [
      //  uv (0,0) corner       edge along u             edge along v
      { corner: [ x, -y,  z], edgeU: [0, 0, -depth],  edgeV: [0, height, 0] }, // +X
      { corner: [-x, -y, -z], edgeU: [0, 0,  depth],  edgeV: [0, height, 0] }, // -X
      { corner: [-x,  y,  z], edgeU: [width, 0,  0],  edgeV: [0, 0, -depth] }, // +Y
      { corner: [-x, -y, -z], edgeU: [width, 0,  0],  edgeV: [0, 0,  depth] }, // -Y
      { corner: [-x, -y,  z], edgeU: [width, 0,  0],  edgeV: [0, height, 0] }, // +Z
      { corner: [ x, -y, -z], edgeU: [-width, 0, 0],  edgeV: [0, height, 0] }, // -Z
    ];

    const vertices = [];
    const indices = [];
    for (const { corner, edgeU, edgeV } of faces) {
      let nx = edgeU[1] * edgeV[2] - edgeU[2] * edgeV[1];
      let ny = edgeU[2] * edgeV[0] - edgeU[0] * edgeV[2];
      let nz = edgeU[0] * edgeV[1] - edgeU[1] * edgeV[0];
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const base = vertices.length / VERTEX_SIZE;
      // The four corners in uv order, then two ccw triangles.
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        vertices.push(
          corner[0] + edgeU[0] * u + edgeV[0] * v,
          corner[1] + edgeU[1] * u + edgeV[1] * v,
          corner[2] + edgeU[2] * u + edgeV[2] * v,
          nx, ny, nz,
          u, v,
        );
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    super(vertices, indices);
  }
}
