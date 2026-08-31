import { prepareTriangleGeometry } from '../../core/geometryData.js';
import { Geometry, VERTEX_SIZE } from './Geometry.js';
import {
  requireIntegerAtLeast,
  requirePositiveFinite,
} from './primitiveGeometry.js';

/**
 * A flat rectangle lying in the XZ plane, facing up (+Y).
 * Handy as a ground plane.
 */
export class PlaneGeometry extends Geometry {
  constructor(width = 1, depth = 1, widthSegments = 1, depthSegments = 1) {
    requirePositiveFinite('PlaneGeometry', 'width', width);
    requirePositiveFinite('PlaneGeometry', 'depth', depth);
    requireIntegerAtLeast(
      'PlaneGeometry',
      'widthSegments',
      widthSegments,
      1,
    );
    requireIntegerAtLeast(
      'PlaneGeometry',
      'depthSegments',
      depthSegments,
      1,
    );

    const w = width / 2;
    const d = depth / 2;
    let vertices;
    let indices;

    // Keep the original quad byte-for-byte compatible for existing callers
    // that inspect or edit its public vertex/index arrays directly.
    if (widthSegments === 1 && depthSegments === 1) {
      // prettier-ignore
      vertices = [
        // position   normal   uv
        -w, 0,  d,    0, 1, 0, 0, 0,
         w, 0,  d,    0, 1, 0, 1, 0,
         w, 0, -d,    0, 1, 0, 1, 1,
        -w, 0, -d,    0, 1, 0, 0, 1,
      ];
      indices = [0, 1, 2, 0, 2, 3];
      const data = prepareTriangleGeometry(
        'PlaneGeometry',
        vertices,
        indices,
        VERTEX_SIZE,
        3,
      );
      super(data.vertices, data.indices);
      return;
    }

    vertices = [];
    indices = [];

    for (let iz = 0; iz <= depthSegments; iz++) {
      const v = iz / depthSegments;
      const z = d - depth * v;
      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments;
        vertices.push(-w + width * u, 0, z, 0, 1, 0, u, v);
      }
    }

    const stride = widthSegments + 1;
    for (let iz = 0; iz < depthSegments; iz++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = iz * stride + ix;
        const b = a + 1;
        const dIndex = a + stride;
        const c = dIndex + 1;
        indices.push(a, b, c, a, c, dIndex);
      }
    }

    const data = prepareTriangleGeometry(
      'PlaneGeometry',
      vertices,
      indices,
      VERTEX_SIZE,
      3,
    );
    super(data.vertices, data.indices);
  }
}
