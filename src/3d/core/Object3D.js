import { Vec3 } from '../../math/Vec3.js';
import { Mat4 } from '../../math/Mat4.js';

/**
 * Base class for everything that lives in the scene graph.
 * Holds a transform (position / rotation / scale) and a list of children,
 * so objects can be parented to each other like in three.js.
 */
export class Object3D {
  constructor() {
    this.position = new Vec3(0, 0, 0);
    /** Euler angles in radians, applied in XYZ order. */
    this.rotation = new Vec3(0, 0, 0);
    this.scale = new Vec3(1, 1, 1);

    this.parent = null;
    this.children = [];
    this.visible = true;

    this.localMatrix = new Mat4();
    this.worldMatrix = new Mat4();
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
}
