import { Shape2d } from './Shape2d.js';
import { srgbToLinear } from '../../math/color.js';
import { INSTANCE_SIZE_2D } from '../constants.js';

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
 * write `instanceData` directly. The instance count is fixed at
 * construction.
 *
 * Note: picking (DragControls2d) sees only the base geometry at the
 * shape's own transform, not the individual instances.
 */
export class InstancedShape2d extends Shape2d {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.isInstanced = true;
    this.count = count;
    this.instanceData = new Float32Array(count * INSTANCE_SIZE_2D);
    // Every instance starts as an identity matrix with a white color.
    for (let i = 0; i < count; i++) {
      const base = i * INSTANCE_SIZE_2D;
      this.instanceData[base] = 1;
      this.instanceData[base + 5] = 1;
      this.instanceData[base + 10] = 1;
      this.instanceData.fill(1, base + 12, base + 16);
    }
    // Resource caches compare revisions so every renderer/device receives
    // an edit, even after another renderer has cleared needsUpdate.
    this._instanceRevision = 0;
    this._needsUpdate = true;
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
    this.instanceData.set(matrix.elements, index * INSTANCE_SIZE_2D);
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
    const base = index * INSTANCE_SIZE_2D + 12;
    this.instanceData[base] = srgbToLinear(color[0]);
    this.instanceData[base + 1] = srgbToLinear(color[1]);
    this.instanceData[base + 2] = srgbToLinear(color[2]);
    this.instanceData[base + 3] = color.length > 3 ? color[3] : 1;
    this.needsUpdate = true;
    return this;
  }
}
