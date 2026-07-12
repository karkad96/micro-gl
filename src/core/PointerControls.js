/**
 * The pointer / wheel plumbing shared by the camera controls
 * (OrbitControls in 3D, PanZoomControls in 2D). Owns everything about
 * reading the input device: button roles, pointer capture, keeping the
 * browser context menu available after a plain right-click, turning
 * wheel events into zoom factors with the cursor position in NDC, and
 * the touch gestures.
 *
 * Mouse gestures: right-drag pans, Alt + left-drag rotates, scroll
 * zooms toward the cursor. Touch gestures: a one-finger drag pans or
 * rotates (see `singleTouchGesture`), a two-finger drag pans, and
 * pinching zooms toward the midpoint between the fingers.
 *
 * Subclasses implement just the camera math:
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
    /**
     * What a one-finger touch drag does: 'pan' (default) or 'rotate'.
     * Two-finger gestures always pan and pinch-zoom.
     */
    this.singleTouchGesture = 'pan';

    this._dragging = false;
    this._panning = false;
    this._leftDrag = false;
    this._panDistance = 0;
    this._lastX = 0;
    this._lastY = 0;
    this._touches = new Map(); // pointerId -> {x, y} of active touch points
    this._pinchDistance = 0;

    // Without this the browser claims touch drags for scrolling and
    // pinches for page zoom before the pointer events reach us.
    this._previousTouchAction = domElement.style.touchAction;
    domElement.style.touchAction = 'none';

    this._onPointerDown = (e) => {
      if (!this.enabled) return;
      if (e.pointerType !== 'mouse') {
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._touches.size === 2) {
          const [a, b] = this._touches.values();
          this._pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        }
        this.domElement.setPointerCapture(e.pointerId);
        return;
      }
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
      if (!this.enabled) return;
      if (e.pointerType !== 'mouse') {
        this._touchMove(e);
        return;
      }
      if (!this._dragging) return;
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
      if (e.pointerType !== 'mouse') {
        this._touches.delete(e.pointerId);
        // Dropping below two fingers re-arms the pinch for next time.
        this._pinchDistance = 0;
      }
      this._dragging = false;
      if (this.domElement.hasPointerCapture(e.pointerId)) {
        this.domElement.releasePointerCapture(e.pointerId);
      }
    };
    // A plain right-click keeps the browser's default menu; if the user
    // dragged (panned) more than a few pixels, block it. Long-pressing
    // during a touch gesture would also pop the menu — block that too.
    this._onContextMenu = (e) => {
      if (!this.enabled) return;
      if (this._panDistance > 3 || this._touches.size > 0) e.preventDefault();
    };
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY * this.zoomSpeed);
      const ndc = this._toNdc(e.clientX, e.clientY);
      this._zoom(factor, ndc.x, ndc.y);
    };

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
    domElement.addEventListener('contextmenu', this._onContextMenu);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /** A client-space position in normalized device coordinates (-1..1). */
  _toNdc(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: 1 - ((clientY - rect.top) / rect.height) * 2,
    };
  }

  _touchMove(e) {
    const touch = this._touches.get(e.pointerId);
    if (!touch) return;

    if (this._touches.size === 1) {
      const dx = e.clientX - touch.x;
      const dy = e.clientY - touch.y;
      touch.x = e.clientX;
      touch.y = e.clientY;
      if (this.singleTouchGesture === 'rotate' && this.enableRotate) {
        this._rotate(dx * this.rotateSpeed, dy * this.rotateSpeed);
      } else {
        this._pan(dx, dy);
      }
      return;
    }

    // Two fingers: pan by the midpoint's motion and zoom by the pinch.
    // Any finger beyond the first two is tracked but ignored.
    const [a, b] = this._touches.values();
    const midXBefore = (a.x + b.x) / 2;
    const midYBefore = (a.y + b.y) / 2;
    touch.x = e.clientX;
    touch.y = e.clientY;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    this._pan(midX - midXBefore, midY - midYBefore);

    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (this._pinchDistance > 0 && distance > 0) {
      // Spreading shrinks the factor below 1 (zoom in), matching the
      // wheel's Math.exp convention.
      const ndc = this._toNdc(midX, midY);
      this._zoom(this._pinchDistance / distance, ndc.x, ndc.y);
    }
    this._pinchDistance = distance;
  }

  /* The camera math, provided by subclasses. */
  _pan(dx, dy) {}
  _rotate(rx, ry) {}
  _zoom(factor, ndcX, ndcY) {}

  dispose() {
    this.domElement.style.touchAction = this._previousTouchAction;
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('wheel', this._onWheel);
  }
}
