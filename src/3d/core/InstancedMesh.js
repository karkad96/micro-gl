import { Mesh } from './Mesh.js';
import { srgbToLinear } from '../../math/color.js';

/** Floats per instance: a mat4 (16) followed by an rgba color (4). */
export const INSTANCE_SIZE = 20;

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
 * Note: picking (Raycaster / DragControls) sees only the base
 * geometry's bounding box at the mesh's own transform, not the
 * individual instances.
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
      this.instanceData.fill(1, base + 16, base + 20);
    }
    /** True when instanceData has changes the renderer hasn't uploaded yet. */
    this.needsUpdate = true;
  }

  /** Copies a Mat4 into instance `index`'s transform. */
  setMatrixAt(index, matrix) {
    this.instanceData.set(matrix.elements, index * INSTANCE_SIZE);
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
    const base = index * INSTANCE_SIZE + 16;
    this.instanceData[base] = srgbToLinear(color[0]);
    this.instanceData[base + 1] = srgbToLinear(color[1]);
    this.instanceData[base + 2] = srgbToLinear(color[2]);
    this.instanceData[base + 3] = color.length > 3 ? color[3] : 1;
    this.needsUpdate = true;
    return this;
  }
}
