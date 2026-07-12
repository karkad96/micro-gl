import { Raycaster } from '../core/Raycaster.js';
import { Vec3 } from '../../math/Vec3.js';
import { Mat4 } from '../../math/Mat4.js';

const _parentInverse = new Mat4();
const _worldPos = new Vec3();
const PARALLEL_PLANE_EPSILON = 1e-9;

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
    this._activePointerId = null;
    this._grabPoint = new Vec3(); // world point where the object was grabbed
    this._grabOffset = new Vec3(); // object world position - grab point
    this._planeNormal = new Vec3();

    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
  }

  _handlePointerDown(event) {
    const orbitGesture = event.button !== 0 || event.altKey;
    if (!this.enabled || orbitGesture || this._activePointerId !== null) return;

    const hit = this._pick(event);
    if (!hit) {
      this._select(null);
      return;
    }

    this._select(hit.object);
    this._dragging = true;
    this._activePointerId = event.pointerId;
    this.domElement.setPointerCapture(event.pointerId);

    // Drag on the camera-facing plane through the grab point.
    const cameraMatrix = this.camera.worldMatrix.elements;
    this._planeNormal.set(cameraMatrix[8], cameraMatrix[9], cameraMatrix[10]);
    this._grabPoint.copy(hit.point);
    const objectMatrix = hit.object.worldMatrix.elements;
    this._grabOffset
      .set(objectMatrix[12], objectMatrix[13], objectMatrix[14])
      .sub(hit.point);

    if (this.onDragStart) this.onDragStart(hit.object);
  }

  _handlePointerMove(event) {
    if (
      !this.enabled ||
      !this._dragging ||
      !this.selected ||
      event.pointerId !== this._activePointerId
    ) {
      return;
    }

    const point = this._intersectDragPlane(event);
    if (!point) return;

    // New world position, then into the parent's local space.
    _worldPos.copy(point).add(this._grabOffset);
    const parent = this.selected.parent;
    if (parent) {
      if (!_parentInverse.copy(parent.worldMatrix).tryInvert()) return;
      _worldPos.applyMat4(_parentInverse);
    }
    this.selected.position.copy(_worldPos);
    if (this.onDrag) this.onDrag(this.selected);
  }

  _handlePointerUp(event) {
    if (!this._dragging || event.pointerId !== this._activePointerId) return;
    this._finishDrag();
  }

  _finishDrag() {
    const pointerId = this._activePointerId;
    this._dragging = false;
    this._activePointerId = null;
    if (
      pointerId !== null &&
      this.domElement.hasPointerCapture(pointerId)
    ) {
      this.domElement.releasePointerCapture(pointerId);
    }
    if (this.onDragEnd) this.onDragEnd(this.selected);
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
    if (Math.abs(denom) < PARALLEL_PLANE_EPSILON) return null;
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
    if (this._dragging) this._finishDrag();
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
  }
}
