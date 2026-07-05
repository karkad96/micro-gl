import { Vec2 } from '../../math/Vec2.js';
import { Mat3 } from '../../math/Mat3.js';

/**
 * Base class for everything that lives in the 2D scene graph — the flat
 * counterpart of Object3d. The transform is genuinely 2D: a Vec2
 * position, a single rotation angle and a Vec2 scale, composed into 3x3
 * matrices instead of 4x4.
 */
export class Object2d {
  constructor() {
    this.position = new Vec2(0, 0);
    /** Rotation around the object's origin, in radians (counter-clockwise). */
    this.rotation = 0;
    this.scale = new Vec2(1, 1);
    /**
     * Draw order: higher values render on top. Objects with equal zIndex
     * keep their scene order (later-added draws on top).
     */
    this.zIndex = 0;

    this.parent = null;
    this.children = [];
    this.visible = true;

    this.localMatrix = new Mat3();
    this.worldMatrix = new Mat3();
    /** Per-object GPU resources, created lazily by the renderer (see GpuResources2d). */
    this._gpu = null;
  }

  add(child) {
    if (child === this) return this;
    if (child.parent) child.parent.remove(child);
    child.parent = this;
    this.children.push(child);
    return this;
  }

  remove(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      child.parent = null;
      this.children.splice(index, 1);
    }
    return this;
  }

  /** Recomputes localMatrix and worldMatrix for this object and all descendants. */
  updateWorldMatrix() {
    this.localMatrix.compose(this.position, this.rotation, this.scale);
    if (this.parent) {
      this.worldMatrix.multiplyMatrices(
        this.parent.worldMatrix,
        this.localMatrix,
      );
    } else {
      this.worldMatrix.copy(this.localMatrix);
    }
    for (const child of this.children) {
      child.updateWorldMatrix();
    }
  }

  /** Calls `callback(object)` for this object and every descendant. */
  traverse(callback) {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }

  /**
   * Destroys the per-object GPU resources the renderer created for this
   * object and its descendants (see GpuResources2d), releasing the
   * memory right away instead of waiting for GC. Geometry buffers are
   * left alone: geometries may be shared between objects. Drawing a
   * disposed object again just re-creates its resources.
   */
  dispose() {
    this.traverse((object) => {
      if (object._gpu) {
        object._gpu.uniformBuffer.destroy();
        object._gpu = null;
      }
    });
    return this;
  }
}
