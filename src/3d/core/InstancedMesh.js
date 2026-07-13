import { Mesh } from './Mesh.js';
import { srgbToLinear } from '../../math/color.js';
import {
  INSTANCE_COLOR_OFFSET,
  INSTANCE_SIZE,
} from '../constants.js';
import { computeInstancedBounds } from './InstancedBounds.js';

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
 * The instance count is fixed at construction. To show fewer instances,
 * scale the extras to zero; to grow, make a new InstancedMesh.
 *
 * Raycaster tests every instance transform and includes `instanceId` in
 * instanced hits. DragControls still moves the InstancedMesh as one batch.
 */
export class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.isInstanced = true;
    this.count = count;
    this.instanceData = new Float32Array(count * INSTANCE_SIZE);
    // Every instance starts as an identity matrix with a white color.
    for (let i = 0; i < count; i++) {
      const base = i * INSTANCE_SIZE;
      this.instanceData[base] = 1;
      this.instanceData[base + 5] = 1;
      this.instanceData[base + 10] = 1;
      this.instanceData[base + 15] = 1;
      this.instanceData.fill(
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
    this.instanceData.set(matrix.elements, index * INSTANCE_SIZE);
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
    const base = index * INSTANCE_SIZE + INSTANCE_COLOR_OFFSET;
    this.instanceData[base] = srgbToLinear(color[0]);
    this.instanceData[base + 1] = srgbToLinear(color[1]);
    this.instanceData[base + 2] = srgbToLinear(color[2]);
    this.instanceData[base + 3] = color.length > 3 ? color[3] : 1;
    this._markInstanceDataUpdated(false);
    return this;
  }

  _markInstanceDataUpdated(boundsChanged) {
    this._needsUpdate = true;
    this._instanceRevision++;
    if (boundsChanged) this._boundsRevision++;
  }
}
