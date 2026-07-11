/**
 * The pointer / wheel plumbing shared by the camera controls
 * (OrbitControls in 3D, PanZoomControls in 2D). Owns everything about
 * reading the input device: button roles, pointer capture, keeping the
 * browser context menu available after a plain right-click, and turning
 * wheel events into zoom factors with the cursor position in NDC.
 *
 * The gestures: right-drag pans, Alt + left-drag rotates, scroll zooms
 * toward the cursor. Subclasses implement just the camera math:
 *   _pan(dx, dy)               pan deltas, in pixels
 *   _rotate(rx, ry)            rotation deltas, pre-scaled by rotateSpeed
 *   _zoom(factor, ndcX, ndcY)  zoom factor plus the cursor in -1..1 NDC
 */
export class PointerControls {
  constructor(domElement) {
    this.domElement = domElement;

    /** Set to false to ignore input, e.g. while dragging an object. */
    this.enabled = true;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.001;
    /** Set to false to disable the rotate gesture (pan and zoom still work). */
    this.enableRotate = true;

    this._dragging = false;
    this._panning = false;
    this._leftDrag = false;
    this._panDistance = 0;
    this._lastX = 0;
    this._lastY = 0;

    this._onPointerDown = (e) => {
      if (!this.enabled) return;
      this._dragging = true;
      // Right button pans; Alt + left button rotates.
      this._panning = e.button === 2;
      this._leftDrag = e.button === 0;
      if (this._panning) this._panDistance = 0;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.domElement.setPointerCapture(e.pointerId);
    };
    this._onPointerMove = (e) => {
      if (!this._dragging || !this.enabled) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      if (this._panning) {
        this._panDistance += Math.abs(dx) + Math.abs(dy);
        this._pan(dx, dy);
      } else if (this._leftDrag && e.altKey && this.enableRotate) {
        // Alt is checked per move event, so pressing it mid-drag
        // starts rotating and releasing it pauses.
        this._rotate(dx * this.rotateSpeed, dy * this.rotateSpeed);
      }
    };
    this._onPointerUp = (e) => {
      this._dragging = false;
      if (this.domElement.hasPointerCapture(e.pointerId)) {
        this.domElement.releasePointerCapture(e.pointerId);
      }
    };
    // A plain right-click keeps the browser's default menu; if the user
    // dragged (panned) more than a few pixels, block it.
    this._onContextMenu = (e) => {
      if (this.enabled && this._panDistance > 3) e.preventDefault();
    };
    this._onWheel = (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      const factor = Math.exp(e.deltaY * this.zoomSpeed);

      // Cursor position in normalized device coordinates (-1..1).
      const rect = this.domElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;

      this._zoom(factor, ndcX, ndcY);
    };

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
    domElement.addEventListener('contextmenu', this._onContextMenu);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /* The camera math, provided by subclasses. */
  _pan(dx, dy) {}
  _rotate(rx, ry) {}
  _zoom(factor, ndcX, ndcY) {}

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('wheel', this._onWheel);
  }
}
