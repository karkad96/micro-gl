import { Vec3 } from '../../math/Vec3.js';
import { Mat4 } from '../../math/Mat4.js';

/**
 * Base class for everything that lives in the scene graph.
 * Holds a transform (position / rotation / scale) and a list of children,
 * so objects can be parented to each other like in three.js.
 */
export class Object3d {
  constructor() {
    this.position = new Vec3(0, 0, 0);
    /** Euler angles in radians, applied in XYZ order. */
    this.rotation = new Vec3(0, 0, 0);
    this.scale = new Vec3(1, 1, 1);

    this.parent = null;
    this.children = [];
    /** Invisible objects — and everything under them — are skipped by rendering and picking. */
    this.visible = true;

    this.localMatrix = new Mat4();
    this.worldMatrix = new Mat4();
    /** Per-object GPU resources, created lazily by the renderer (see GpuResources). */
    this._gpu = null;
  }

  add(child) {
    // Adding an object to itself or to one of its own descendants would
    // create a cycle and hang traverse/updateWorldMatrix — refuse it.
    for (let node = this; node; node = node.parent) {
      if (node === child) return this;
    }
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
   * Like traverse, but skips objects with `visible = false` and their
   * whole subtree — hiding a group hides everything inside it. The
   * renderer and raycaster walk the scene with this.
   */
  traverseVisible(callback) {
    if (!this.visible) return;
    callback(this);
    for (const child of this.children) {
      child.traverseVisible(callback);
    }
  }

  /**
   * Destroys the per-object GPU resources the renderer created for this
   * object and its descendants (see GpuResources), releasing the memory
   * right away instead of waiting for GC. Geometry buffers are left
   * alone: geometries may be shared between objects. Drawing a disposed
   * object again just re-creates its resources.
   */
  dispose() {
    this.traverse((object) => {
      if (object._gpu) {
        object._gpu.uniformBuffer.destroy();
        if (object._gpu.instanceBuffer) object._gpu.instanceBuffer.destroy();
        object._gpu = null;
      }
    });
    return this;
  }
}
