import { Vec2 } from '../../math/Vec2.js';
import { Mat3 } from '../../math/Mat3.js';

/**
 * Base class for everything that lives in the 2D scene graph — the flat
 * counterpart of Object3D. The transform is genuinely 2D: a Vec2
 * position, a single rotation angle and a Vec2 scale, composed into 3x3
 * matrices instead of 4x4.
 */
export class Object2D {
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
