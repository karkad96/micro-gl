import { Geometry2d, VERTEX_SIZE_2D } from './Geometry2d.js';
import { prepareLineGeometry } from '../../core/geometryData.js';

/**
 * A circle perimeter represented by closed line-list edges. Pair it with a
 * material whose topology is `line-list`; native WebGPU lines are one device
 * pixel wide.
 */
export class CircleOutlineGeometry extends Geometry2d {
  /**
   * @param {number} radius radius in world units
   * @param {number} segments number of line segments around the circle
   * @param {object} [options]
   * @param {number} [options.hitTolerance=0.05] local-space picking tolerance;
   *   this does not affect the rendered line width
   */
  constructor(
    radius = 0.5,
    segments = 32,
    { hitTolerance = 0.05 } = {},
  ) {
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError(
        'CircleOutlineGeometry radius must be a finite positive number',
      );
    }
    if (!Number.isFinite(segments) || segments < 0) {
      throw new RangeError(
        'CircleOutlineGeometry segments must be a finite non-negative number',
      );
    }
    if (!Number.isFinite(hitTolerance) || hitTolerance < 0) {
      throw new RangeError(
        'CircleOutlineGeometry hitTolerance must be finite and non-negative',
      );
    }

    segments = Math.max(3, Math.floor(segments));
    const vertices = [];
    const indices = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const c = Math.cos(angle),
        s = Math.sin(angle);
      vertices.push(radius * c, radius * s, 0.5 + c * 0.5, 0.5 + s * 0.5);
      indices.push(i, (i + 1) % segments);
    }

    const data = prepareLineGeometry(
      'CircleOutlineGeometry',
      vertices,
      indices,
      VERTEX_SIZE_2D,
      2,
    );
    super(data.vertices, data.indices);
    this.radius = radius;
    this.segments = segments;
    this.hitTolerance = hitTolerance;
  }

  /** Tests the local-space distance to the generated polygon edges. */
  containsPoint(x, y) {
    const toleranceSquared = this.hitTolerance * this.hitTolerance;
    const vertexCount = this.vertexCount;
    for (let i = 0; i < vertexCount; i++) {
      const a = i * VERTEX_SIZE_2D;
      const b = ((i + 1) % vertexCount) * VERTEX_SIZE_2D;
      const ax = this.vertices[a];
      const ay = this.vertices[a + 1];
      const dx = this.vertices[b] - ax;
      const dy = this.vertices[b + 1] - ay;
      const lengthSquared = dx * dx + dy * dy;
      const projection =
        lengthSquared === 0
          ? 0
          : Math.min(
              1,
              Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared),
            );
      const offsetX = x - (ax + projection * dx);
      const offsetY = y - (ay + projection * dy);
      if (offsetX * offsetX + offsetY * offsetY <= toleranceSquared) {
        return true;
      }
    }
    return false;
  }
}
