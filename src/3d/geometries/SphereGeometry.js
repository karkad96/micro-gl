import { Geometry } from './Geometry.js';

/**
 * A UV sphere centered on the origin.
 */
export class SphereGeometry extends Geometry {
  constructor(radius = 1, widthSegments = 24, heightSegments = 16) {
    widthSegments = Math.max(3, Math.floor(widthSegments));
    heightSegments = Math.max(2, Math.floor(heightSegments));

    const vertices = [];
    const indices = [];
    const grid = [];

    let index = 0;
    for (let iy = 0; iy <= heightSegments; iy++) {
      const row = [];
      const v = iy / heightSegments;
      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments;

        const x = -radius * Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI);
        const y = radius * Math.cos(v * Math.PI);
        const z = radius * Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);

        vertices.push(x, y, z, x / radius, y / radius, z / radius, u, 1 - v);
        row.push(index++);
      }
      grid.push(row);
    }

    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];

        if (iy !== 0) indices.push(a, b, d);
        if (iy !== heightSegments - 1) indices.push(b, c, d);
      }
    }

    super(vertices, indices);
  }
}
