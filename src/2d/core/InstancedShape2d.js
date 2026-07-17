import { Shape2d } from './Shape2d.js';
import { srgbToLinear } from '../../math/color.js';
import { INSTANCE_SIZE_2D } from '../constants.js';
import {
  validateInstanceCapacity,
  validateInstanceCount,
  validateInstanceIndex,
} from '../../core/instanceCapacity.js';

export { INSTANCE_SIZE_2D } from '../constants.js';

/**
 * A Shape2d drawn `count` times in one draw call — the 2D counterpart
 * of InstancedMesh. Each instance has its own transform and color;
 * instance transforms are local to the shape and instance colors
 * multiply with the material's color. The whole group sorts by the
 * shape's single `zIndex`; instances draw in buffer order within it.
 *
 * Write instances with `setMatrixAt`/`setColorAt` — they mark the
 * buffer for re-upload; set `needsUpdate = true` yourself only if you
 * write `instanceData` directly. `capacity` is fixed at construction;
 * `count` can select how many leading instances are drawn.
 *
 * Note: picking (DragControls2d) sees only the base geometry at the
 * shape's own transform, not the individual instances.
 */
export class InstancedShape2d extends Shape2d {
  constructor(geometry, material, capacity) {
    super(geometry, material);
    this.isInstanced = true;
    this._capacity = validateInstanceCapacity(
      capacity,
      'InstancedShape2d',
    );
    this._count = this._capacity;
    this._instanceData = new Float32Array(
      this._capacity * INSTANCE_SIZE_2D,
    );
    // Every instance starts as an identity matrix with a white color.
    for (let i = 0; i < this._capacity; i++) {
      const base = i * INSTANCE_SIZE_2D;
      this._instanceData[base] = 1;
      this._instanceData[base + 5] = 1;
      this._instanceData[base + 10] = 1;
      this._instanceData.fill(1, base + 12, base + 16);
    }
    // Resource caches compare revisions so every renderer/device receives
    // an edit, even after another renderer has cleared needsUpdate.
    this._instanceRevision = 0;
    this._needsUpdate = true;
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
      'InstancedShape2d',
    );
  }

  /**
   * Fixed-size instance storage. Its elements are mutable, but the array
   * itself cannot be replaced because its byte length defines GPU capacity.
   */
  get instanceData() {
    return this._instanceData;
  }

  /** Upload hint; set true after changing `instanceData` directly. */
  get needsUpdate() {
    return this._needsUpdate;
  }

  set needsUpdate(value) {
    this._needsUpdate = Boolean(value);
    if (this._needsUpdate) this._instanceRevision++;
  }

  /** Copies a Mat3 into instance `index`'s transform. */
  setMatrixAt(index, matrix) {
    validateInstanceIndex(index, this._capacity, 'InstancedShape2d');
    this._instanceData.set(matrix.elements, index * INSTANCE_SIZE_2D);
    this.needsUpdate = true;
    return this;
  }

  /**
   * Sets instance `index`'s color from [r, g, b] or [r, g, b, a] —
   * sRGB display values like material colors. They are stored
   * linearized (shading happens in linear space), so write linear
   * values if you fill `instanceData` directly instead.
   */
  setColorAt(index, color) {
    validateInstanceIndex(index, this._capacity, 'InstancedShape2d');
    const base = index * INSTANCE_SIZE_2D + 12;
    this._instanceData[base] = srgbToLinear(color[0]);
    this._instanceData[base + 1] = srgbToLinear(color[1]);
    this._instanceData[base + 2] = srgbToLinear(color[2]);
    this._instanceData[base + 3] = color.length > 3 ? color[3] : 1;
    this.needsUpdate = true;
    return this;
  }
}
