/**
 * Holds the raw mesh data on the CPU side.
 *
 * Vertices are interleaved as 8 floats each:
 *   position (x, y, z), normal (x, y, z), uv (u, v)
 * so one GPU vertex buffer with a 32-byte stride serves every attribute.
 *
 * The renderer lazily creates the GPU buffers the first time the
 * geometry is drawn and stores them on `_gpu`.
 */
export class Geometry {
  /**
   * @param {Float32Array|number[]} vertices interleaved vertex data
   * @param {Uint32Array|number[]}  indices  triangle indices
   */
  constructor(vertices, indices) {
    this.vertices =
      vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
    this.indices =
      indices instanceof Uint32Array ? indices : new Uint32Array(indices);
    this._gpu = null;
    this._bounds = null;
  }

  /**
   * Local-space axis-aligned bounding box `{ min, max }`, computed from
   * the vertex positions on first access. Used for raycasting.
   */
  get bounds() {
    if (!this._bounds) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < this.vertices.length; i += VERTEX_SIZE) {
        for (let a = 0; a < 3; a++) {
          const v = this.vertices[i + a];
          if (v < min[a]) min[a] = v;
          if (v > max[a]) max[a] = v;
        }
      }
      this._bounds = { min, max };
    }
    return this._bounds;
  }

  get vertexCount() {
    return this.vertices.length / 8;
  }

  get indexCount() {
    return this.indices.length;
  }
}

/** Number of floats per vertex (3 position + 3 normal + 2 uv). */
export const VERTEX_SIZE = 8;
/** Byte stride of one vertex in the GPU buffer. */
export const VERTEX_STRIDE = VERTEX_SIZE * 4;
