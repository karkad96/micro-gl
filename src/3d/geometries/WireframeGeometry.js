import { Geometry, VERTEX_SIZE } from './Geometry.js';

/**
 * The unique edges of a triangle geometry as line segments — a
 * wireframe. Draw it with a line-list material:
 *
 *   new Mesh(
 *     new WireframeGeometry(new BoxGeometry()),
 *     new BasicMaterial({ color: [0, 0, 0], topology: 'line-list' }),
 *   )
 *
 * The source's vertex array is shared, not copied; only new line-list
 * indices are built. Edges are deduplicated by index pair, so seams
 * where a geometry duplicates vertices (BoxGeometry's face corners,
 * SphereGeometry's date line) keep one segment per copy — they draw
 * identically.
 */
export class WireframeGeometry extends Geometry {
  /** @param {Geometry} geometry a triangle-list geometry */
  constructor(geometry) {
    const source = geometry.indices;
    const vertexCount = geometry.vertices.length / VERTEX_SIZE;
    const indices = [];
    const seen = new Set();
    for (let i = 0; i < source.length; i += 3) {
      const triangle = [source[i], source[i + 1], source[i + 2]];
      for (let e = 0; e < 3; e++) {
        const a = triangle[e];
        const b = triangle[(e + 1) % 3];
        const key = Math.min(a, b) * vertexCount + Math.max(a, b);
        if (!seen.has(key)) {
          seen.add(key);
          indices.push(a, b);
        }
      }
    }
    super(geometry.vertices, indices);
  }
}
