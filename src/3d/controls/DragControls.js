import { Raycaster } from '../core/Raycaster.js';
import { Vec3 } from '../../math/Vec3.js';
import { Mat4 } from '../../math/Mat4.js';

const _parentInverse = new Mat4();
const _worldPos = new Vec3();

/**
 * Lets the user pick meshes with the pointer and drag them around.
 * Dragged objects slide on a camera-facing plane through the point
 * where they were grabbed, so they follow the cursor exactly.
 *
 * Assign the callbacks to react to interaction:
 *   onSelect(mesh | null)  selection changed (click on object / empty space)
 *   onDragStart(mesh), onDrag(mesh), onDragEnd(mesh)
 *
 * Disable your camera controls in onDragStart / re-enable in onDragEnd
 * so orbiting doesn't fight the drag. If you switch the active camera,
 * update `controls.camera` too.
 */
export class DragControls {
  /**
   * @param {Mesh[]} objects meshes that can be selected and dragged
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

    this._raycaster = new Raycaster();
    this._dragging = false;
    this._grabPoint = new Vec3(); // world point where the object was grabbed
    this._grabOffset = new Vec3(); // object world position - grab point
    this._planeNormal = new Vec3();

    this._onPointerDown = (e) => {
      // Alt + left button is the orbit gesture — leave it alone.
      if (!this.enabled || e.button !== 0 || e.altKey) return;
      const hit = this._pick(e);
      if (hit) {
        this._select(hit.object);
        this._dragging = true;
        this.domElement.setPointerCapture(e.pointerId);

        // Drag on the camera-facing plane through the grab point.
        const m = this.camera.worldMatrix.elements;
        this._planeNormal.set(m[8], m[9], m[10]);
        this._grabPoint.copy(hit.point);
        const w = hit.object.worldMatrix.elements;
        this._grabOffset.set(w[12], w[13], w[14]).sub(hit.point);

        if (this.onDragStart) this.onDragStart(hit.object);
      } else {
        this._select(null);
      }
    };

    this._onPointerMove = (e) => {
      if (!this.enabled || !this._dragging || !this.selected) return;
      const point = this._intersectDragPlane(e);
      if (!point) return;

      // New world position, then into the parent's local space.
      _worldPos.copy(point).add(this._grabOffset);
      const parent = this.selected.parent;
      if (parent) {
        _parentInverse.copy(parent.worldMatrix).invert();
        _worldPos.applyMat4(_parentInverse);
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

  _select(mesh) {
    if (mesh === this.selected) return;
    this.selected = mesh;
    if (this.onSelect) this.onSelect(mesh);
  }

  _ray(e) {
    const rect = this.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    return this._raycaster.setFromCamera(ndcX, ndcY, this.camera);
  }

  _pick(e) {
    const hits = this._ray(e).intersectObjects(this.objects);
    return hits.length > 0 ? hits[0] : null;
  }

  /** Where the pointer ray crosses the drag plane, or null if parallel. */
  _intersectDragPlane(e) {
    const ray = this._ray(e);
    const n = this._planeNormal;
    const denom = n.dot(ray.direction);
    if (Math.abs(denom) < 1e-9) return null;
    const t =
      (n.x * (this._grabPoint.x - ray.origin.x) +
        n.y * (this._grabPoint.y - ray.origin.y) +
        n.z * (this._grabPoint.z - ray.origin.z)) /
      denom;
    return new Vec3(
      ray.origin.x + ray.direction.x * t,
      ray.origin.y + ray.direction.y * t,
      ray.origin.z + ray.direction.z * t,
    );
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
  }
}
