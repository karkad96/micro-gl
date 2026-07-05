import { Geometry2d } from './Geometry2d.js';

/**
 * A circle centered on the origin, built as a triangle fan.
 */
export class CircleGeometry extends Geometry2d {
  constructor(radius = 0.5, segments = 32) {
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

    super(vertices, indices);
    this.radius = radius;
  }

  /** Exact circle test — tighter than the bounding-box default. */
  containsPoint(x, y) {
    return x * x + y * y <= this.radius * this.radius;
  }
}
