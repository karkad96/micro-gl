import { Mesh } from './Mesh.js';
import { srgbToLinear } from '../../math/color.js';
import {
  INSTANCE_COLOR_OFFSET,
  INSTANCE_SIZE,
} from '../constants.js';
import { computeInstancedBounds } from './InstancedBounds.js';
import {
  validateInstanceCapacity,
  validateInstanceCount,
  validateInstanceIndex,
} from '../../core/instanceCapacity.js';

export { INSTANCE_SIZE } from '../constants.js';

/**
 * A Mesh drawn `count` times in one draw call. Each instance has its
 * own transform and color, packed into `instanceData` and uploaded as
 * an instance-step vertex buffer — thousands of copies cost one
 * uniform upload and one drawIndexed instead of thousands.
 *
 * Instance transforms are local to the mesh: the mesh's own scene-graph
 * transform applies on top, and instance colors multiply with the
 * material's color. Write instances with `setMatrixAt`/`setColorAt` —
 * they mark the buffer for re-upload; set `needsUpdate = true` yourself
 * only if you write `instanceData` directly.
 *
 * `capacity` is fixed at construction because it determines the CPU and GPU
 * allocation. `count` starts at that capacity and can be changed from 0 to
 * `capacity` to draw only the first part of the allocation. To grow beyond
 * the capacity, make a new InstancedMesh.
 *
 * Raycaster tests every instance transform and includes `instanceId` in
 * instanced hits. DragControls still moves the InstancedMesh as one batch.
 */
export class InstancedMesh extends Mesh {
  constructor(geometry, material, capacity) {
    super(geometry, material);
    this.isInstanced = true;
    this._capacity = validateInstanceCapacity(
      capacity,
      'InstancedMesh',
    );
    this._count = this._capacity;
    this._instanceData = new Float32Array(
      this._capacity * INSTANCE_SIZE,
    );
    // Every instance starts as an identity matrix with a white color.
    for (let i = 0; i < this._capacity; i++) {
      const base = i * INSTANCE_SIZE;
      this._instanceData[base] = 1;
      this._instanceData[base + 5] = 1;
      this._instanceData[base + 10] = 1;
      this._instanceData[base + 15] = 1;
      this._instanceData.fill(
        1,
        base + INSTANCE_COLOR_OFFSET,
        base + INSTANCE_SIZE,
      );
    }
    // Resource caches compare revisions so every renderer/device receives
    // an edit, even after another renderer has cleared needsUpdate.
    this._instanceRevision = 0;
    this._boundsRevision = 0;
    this._needsUpdate = true;
    this._instanceBounds = null;
    this._instanceBoundsSource = null;
    this._instanceBoundsRevision = -1;
    this._instanceBoundsCount = -1;
  }

  /** Maximum number of instances; fixed for this object's lifetime. */
  get capacity() {
    return this._capacity;
  }

  /** Number of leading instance records submitted by each draw call. */
  get count() {
    return this._count;
  }

  set count(value) {
    this._count = validateInstanceCount(
      value,
      this._capacity,
      'InstancedMesh',
    );
  }

  /**
   * Fixed-size instance storage. Its elements are mutable, but the array
   * itself cannot be replaced because its byte length defines GPU capacity.
   */
  get instanceData() {
    return this._instanceData;
  }

  /**
   * Mesh-local union of every transformed instance. Frustum culling remains
   * batch-level: if this box intersects, all `count` instances draw together.
   */
  get bounds() {
    const sourceBounds = this.geometry?.bounds || null;
    if (
      this._instanceBoundsSource !== sourceBounds ||
      this._instanceBoundsRevision !== this._boundsRevision ||
      this._instanceBoundsCount !== this.count
    ) {
      this._instanceBounds = computeInstancedBounds(
        sourceBounds,
        this.instanceData,
        this.count,
      );
      this._instanceBoundsSource = sourceBounds;
      this._instanceBoundsRevision = this._boundsRevision;
      this._instanceBoundsCount = this.count;
    }
    return this._instanceBounds;
  }

  /** Upload hint; set true after changing `instanceData` directly. */
  get needsUpdate() {
    return this._needsUpdate;
  }

  set needsUpdate(value) {
    this._needsUpdate = Boolean(value);
    if (this._needsUpdate) {
      this._instanceRevision++;
      // Direct writes may have changed matrices, so conservatively invalidate.
      this._boundsRevision++;
    }
  }

  /** Copies a Mat4 into instance `index`'s transform. */
  setMatrixAt(index, matrix) {
    validateInstanceIndex(index, this._capacity, 'InstancedMesh');
    this._instanceData.set(matrix.elements, index * INSTANCE_SIZE);
    this._markInstanceDataUpdated(true);
    return this;
  }

  /**
   * Sets instance `index`'s color from [r, g, b] or [r, g, b, a] —
   * sRGB display values like material colors. They are stored
   * linearized (shading happens in linear space), so write linear
   * values if you fill `instanceData` directly instead.
   */
  setColorAt(index, color) {
    validateInstanceIndex(index, this._capacity, 'InstancedMesh');
    const base = index * INSTANCE_SIZE + INSTANCE_COLOR_OFFSET;
    this._instanceData[base] = srgbToLinear(color[0]);
    this._instanceData[base + 1] = srgbToLinear(color[1]);
    this._instanceData[base + 2] = srgbToLinear(color[2]);
    this._instanceData[base + 3] = color.length > 3 ? color[3] : 1;
    this._markInstanceDataUpdated(false);
    return this;
  }

  _markInstanceDataUpdated(boundsChanged) {
    this._needsUpdate = true;
    this._instanceRevision++;
    if (boundsChanged) this._boundsRevision++;
  }
}
