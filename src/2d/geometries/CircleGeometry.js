import { Geometry2d, VERTEX_SIZE_2D } from './Geometry2d.js';
import { prepareTriangleGeometry } from '../../core/geometryData.js';

/**
 * A circle centered on the origin, built as a triangle fan.
 */
export class CircleGeometry extends Geometry2d {
  constructor(radius = 0.5, segments = 32) {
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError(
        'CircleGeometry radius must be a finite positive number',
      );
    }
    if (!Number.isFinite(segments) || segments < 0) {
      throw new RangeError(
        'CircleGeometry segments must be a finite non-negative number',
      );
    }
    segments = Math.max(3, Math.floor(segments));

    // Center vertex, then one vertex per rim segment.
    const vertices = [0, 0, 0.5, 0.5];
    const indices = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const c = Math.cos(angle),
        s = Math.sin(angle);
      vertices.push(radius * c, radius * s, 0.5 + c * 0.5, 0.5 + s * 0.5);
      indices.push(0, 1 + i, 1 + ((i + 1) % segments));
    }

    const data = prepareTriangleGeometry(
      'CircleGeometry',
      vertices,
      indices,
      VERTEX_SIZE_2D,
      2,
    );
    super(data.vertices, data.indices);
    this.radius = radius;
    this.segments = segments;
  }

  /** Exact circle test — tighter than the bounding-box default. */
  containsPoint(x, y) {
    return x * x + y * y <= this.radius * this.radius;
  }
}
