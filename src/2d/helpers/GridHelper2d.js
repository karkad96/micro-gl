import { Shape2d } from '../core/Shape2d.js';
import { Geometry2d } from '../geometries/Geometry2d.js';
import { BasicMaterial2d } from '../materials/BasicMaterial2d.js';

/**
 * A square grid of lines in the XY plane, centered on the origin.
 * One unlit line-list Shape2d, so move, parent, order or hide it like
 * any other 2D object.
 */
export class GridHelper2d extends Shape2d {
  /**
   * @param {number}   size      total width/height in world units
   * @param {number}   divisions cells per side
   * @param {number[]} color     line color, [r, g, b] in 0..1
   */
  constructor(size = 10, divisions = 10, color = [0.4, 0.4, 0.45]) {
    const half = size / 2;
    const vertices = [];
    const indices = [];
    for (let i = 0; i <= divisions; i++) {
      const t = -half + (i / divisions) * size;
      // One horizontal and one vertical line per step; 4 floats per
      // vertex (position, unused uv) to match VERTEX_STRIDE_2D.
      // prettier-ignore
      vertices.push(
        -half, t,     0, 0,
         half, t,     0, 0,
         t,   -half,  0, 0,
         t,    half,  0, 0,
      );
      const base = i * 4;
      indices.push(base, base + 1, base + 2, base + 3);
    }
    super(
      new Geometry2d(vertices, indices),
      new BasicMaterial2d({ color, topology: 'line-list' }),
    );
  }
}
