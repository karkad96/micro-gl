import { Mesh } from '../core/Mesh.js';
import { Geometry } from '../geometries/Geometry.js';
import { BasicMaterial } from '../materials/BasicMaterial.js';

/**
 * A square grid of lines in the XZ plane (y = 0), centered on the
 * origin — the usual ground reference while building a scene. One
 * unlit line-list Mesh, so move, parent or hide it like any other
 * object.
 *
 * Tip: a PlaneGeometry ground at y = 0 z-fights with the grid; nudge
 * the grid up a hair (grid.position.y = 0.001) or the ground down.
 */
export class GridHelper extends Mesh {
  /**
   * @param {number}   size      total width/depth in world units
   * @param {number}   divisions cells per side
   * @param {number[]} color     line color, [r, g, b] in 0..1
   */
  constructor(size = 10, divisions = 10, color = [0.4, 0.4, 0.45]) {
    const half = size / 2;
    const vertices = [];
    const indices = [];
    for (let i = 0; i <= divisions; i++) {
      const t = -half + (i / divisions) * size;
      // One line along X and one along Z per step; 8 floats per vertex
      // (position, unused normal, unused uv) to match VERTEX_STRIDE.
      // prettier-ignore
      vertices.push(
        -half, 0, t,     0, 1, 0,  0, 0,
         half, 0, t,     0, 1, 0,  0, 0,
         t,    0, -half, 0, 1, 0,  0, 0,
         t,    0,  half, 0, 1, 0,  0, 0,
      );
      const base = i * 4;
      indices.push(base, base + 1, base + 2, base + 3);
    }
    super(
      new Geometry(vertices, indices),
      new BasicMaterial({ color, topology: 'line-list' }),
    );
  }
}
