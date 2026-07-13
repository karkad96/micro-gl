/**
 * Holds the raw mesh data on the CPU side.
 *
 * Vertices are interleaved as 8 floats each:
 *   position (x, y, z), normal (x, y, z), uv (u, v)
 * so one GPU vertex buffer with a 32-byte stride serves every attribute.
 *
 * Renderers lazily create GPU buffers the first time the geometry is
 * drawn. `_gpu` holds one cache entry per GPUDevice, so the same CPU
 * geometry can safely be shared by independently initialized renderers.
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
    this._needsUpdate = false;
    // Each cache entry records the revision it last uploaded. A revision
    // cannot be replaced by one boolean when several devices share this data.
    this._gpuRevision = 0;
  }

  /**
   * Set to true after editing `vertices` or `indices` in place: the
   * renderer re-uploads the GPU buffers on the next draw and the cached
   * bounds are recomputed. The arrays must keep their length — to
   * change the vertex or index count, make a new geometry.
   */
  get needsUpdate() {
    return this._needsUpdate;
  }

  set needsUpdate(value) {
    this._needsUpdate = Boolean(value);
    if (this._needsUpdate) {
      this._gpuRevision++;
      this._bounds = null;
    }
  }

  /**
   * Local-space axis-aligned bounding box `{ min, max }`, computed from
   * the vertex positions on first access. Used as the raycasting broad phase
   * and for frustum culling.
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
    return this.vertices.length / VERTEX_SIZE;
  }

  get indexCount() {
    return this.indices.length;
  }

  /**
   * Destroys the GPU vertex/index buffers (if any), releasing the
   * memory right away instead of waiting for GC. Call it when nothing
   * draws this geometry anymore; drawing it again re-uploads.
   */
  dispose() {
    if (this._gpu) {
      for (const { vertexBuffer, indexBuffer } of this._gpu.values()) {
        vertexBuffer.destroy();
        indexBuffer.destroy();
      }
      this._gpu = null;
    }
    return this;
  }
}

/** Number of floats per vertex (3 position + 3 normal + 2 uv). */
export const VERTEX_SIZE = 8;
/** Byte stride of one vertex in the GPU buffer. */
export const VERTEX_STRIDE = VERTEX_SIZE * Float32Array.BYTES_PER_ELEMENT;
