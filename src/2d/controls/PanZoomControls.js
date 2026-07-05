/**
 * Mouse / touch controls for a Camera2d: right-drag to pan, scroll to
 * zoom (toward the cursor), Alt + left-drag to spin the view. A
 * right-click without dragging still opens the browser context menu.
 *
 * The same gestures as OrbitControls, minus the orbit — and because a
 * 2D camera has no derived state, the handlers modify it directly, so
 * there is no per-frame update() to call.
 */
export class PanZoomControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    /** Set to false to ignore input, e.g. while dragging a shape. */
    this.enabled = true;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.001;
    /** Set to false to disable spinning the view (pan and zoom still work). */
    this.enableRotate = true;
    this.minZoom = 0.1;
    this.maxZoom = 20;

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
        this.camera.rotation += dx * this.rotateSpeed;
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

      const halfHBefore = this._visibleHalfHeight();
      this.camera.zoom /= factor;
      this.camera.zoom = Math.min(
        Math.max(this.camera.zoom, this.minZoom),
        this.maxZoom,
      );

      // Zoom toward the cursor: shift the camera so the world point
      // under the pointer stays under it as the view scales.
      const dh = halfHBefore - this._visibleHalfHeight();
      const ox = ndcX * dh * this.camera.aspect;
      const oy = ndcY * dh;
      const c = Math.cos(this.camera.rotation);
      const s = Math.sin(this.camera.rotation);
      this.camera.position.x += c * ox - s * oy;
      this.camera.position.y += s * ox + c * oy;
    };

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
    domElement.addEventListener('contextmenu', this._onContextMenu);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /** Half the height of the visible area, in world units. */
  _visibleHalfHeight() {
    return this.camera.size / this.camera.zoom;
  }

  /**
   * Moves the camera along its screen-space axes so the scene follows
   * the cursor (1 pixel of drag = 1 pixel on screen).
   */
  _pan(dx, dy) {
    const worldPerPixel =
      (2 * this._visibleHalfHeight()) / this.domElement.clientHeight;
    // The camera's right axis is (cos r, sin r), its up axis (-sin r, cos r).
    const c = Math.cos(this.camera.rotation);
    const s = Math.sin(this.camera.rotation);
    this.camera.position.x -= (c * dx + s * dy) * worldPerPixel;
    this.camera.position.y -= (s * dx - c * dy) * worldPerPixel;
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('wheel', this._onWheel);
  }
}
