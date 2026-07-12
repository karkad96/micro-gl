import { Vec2 } from '../../math/Vec2.js';
import { Mat3 } from '../../math/Mat3.js';

const _inverse = new Mat3();
const _pointer = new Vec2();
const _local = new Vec2();
const _worldPos = new Vec2();

/**
 * Lets the user pick shapes with the pointer and drag them around —
 * the 2D counterpart of DragControls, without needing a Raycaster:
 * the pointer is mapped into world space through the inverse camera
 * matrix and tested against each shape's geometry directly.
 *
 * Assign the callbacks to react to interaction:
 *   onSelect(shape | null)  selection changed (click on shape / empty space)
 *   onDragStart(shape), onDrag(shape), onDragEnd(shape)
 *
 * Disable your camera controls in onDragStart / re-enable in onDragEnd
 * so panning doesn't fight the drag.
 */
export class DragControls2d {
  /**
   * @param {Shape2d[]} objects shapes that can be selected and dragged
   */
  constructor(objects, camera, domElement) {
    this.objects = objects;
    this.camera = camera;
    this.domElement = domElement;
    /** Set to false to ignore input; it also pauses an in-progress drag. */
    this.enabled = true;
    this.selected = null;

    this.onSelect = null;
    this.onDragStart = null;
    this.onDrag = null;
    this.onDragEnd = null;

    this._dragging = false;
    this._grabOffset = new Vec2(); // shape world position - grab point

    this._onPointerDown = (e) => {
      // Alt + left button is the rotate-view gesture — leave it alone.
      if (!this.enabled || e.button !== 0 || e.altKey) return;
      const point = this._pointerToWorld(e);
      const hit = this._pick(point);
      if (hit) {
        this._select(hit);
        this._dragging = true;
        this.domElement.setPointerCapture(e.pointerId);

        const w = hit.worldMatrix.elements;
        this._grabOffset.set(w[8] - point.x, w[9] - point.y);

        if (this.onDragStart) this.onDragStart(hit);
      } else {
        this._select(null);
      }
    };

    this._onPointerMove = (e) => {
      if (!this.enabled || !this._dragging || !this.selected) return;
      const point = this._pointerToWorld(e);

      // New world position, then into the parent's local space.
      _worldPos.copy(point).add(this._grabOffset);
      const parent = this.selected.parent;
      if (parent) {
        _inverse.copy(parent.worldMatrix).invert();
        _worldPos.applyMat3(_inverse);
      }
      this.selected.position.copy(_worldPos);
      if (this.onDrag) this.onDrag(this.selected);
    };

    this._onPointerUp = (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      if (this.domElement.hasPointerCapture(e.pointerId)) {
        this.domElement.releasePointerCapture(e.pointerId);
      }
      if (this.onDragEnd) this.onDragEnd(this.selected);
    };

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
  }

  _select(shape) {
    if (shape === this.selected) return;
    this.selected = shape;
    if (this.onSelect) this.onSelect(shape);
  }

  /** The pointer position in world space (via the inverse view-projection). */
  _pointerToWorld(e) {
    const rect = this.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    _inverse.copy(this.camera.viewProjectionMatrix).invert();
    return _pointer.set(ndcX, ndcY).applyMat3(_inverse);
  }

  /**
   * The topmost shape under the world-space point, or null. Higher
   * zIndex wins; ties go to the later entry in `objects`, matching the
   * renderer's draw order when the array follows scene order.
   */
  _pick(point) {
    let hit = null;
    for (const shape of this.objects) {
      if (!shape.visible) continue;
      _local.copy(point).applyMat3(_inverse.copy(shape.worldMatrix).invert());
      if (!shape.geometry.containsPoint(_local.x, _local.y)) continue;
      if (!hit || shape.zIndex >= hit.zIndex) hit = shape;
    }
    return hit;
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
  }
}
