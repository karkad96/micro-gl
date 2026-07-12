export const TOUCH_GESTURE = Object.freeze({
  PAN: 'pan',
  ROTATE: 'rotate',
});

const MOUSE_POINTER_TYPE = 'mouse';
const RIGHT_MOUSE_BUTTON = 2;
const LEFT_MOUSE_BUTTON = 0;
const TWO_TOUCHES = 2;
const NDC_SPAN = 2;
const CONTEXT_MENU_PAN_THRESHOLD = 3;
const DEFAULT_ROTATE_SPEED = 0.005;
const DEFAULT_ZOOM_SPEED = 0.001;
const touchActionClaims = new WeakMap();

function claimTouchAction(element) {
  let claim = touchActionClaims.get(element);
  if (!claim) {
    claim = { owners: 0, previous: element.style.touchAction };
    touchActionClaims.set(element, claim);
  }
  claim.owners++;
  element.style.touchAction = 'none';
}

function releaseTouchAction(element) {
  const claim = touchActionClaims.get(element);
  if (!claim) return;
  claim.owners--;
  if (claim.owners === 0) {
    element.style.touchAction = claim.previous;
    touchActionClaims.delete(element);
  }
}

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
    this.rotateSpeed = DEFAULT_ROTATE_SPEED;
    this.zoomSpeed = DEFAULT_ZOOM_SPEED;
    /** Set to false to disable the rotate gesture (pan and zoom still work). */
    this.enableRotate = true;
    /**
     * What a one-finger touch drag does: 'pan' (default) or 'rotate'.
     * Two-finger gestures always pan and pinch-zoom.
     */
    this.singleTouchGesture = TOUCH_GESTURE.PAN;

    this._dragging = false;
    this._panning = false;
    this._leftDrag = false;
    this._panDistance = 0;
    this._lastX = 0;
    this._lastY = 0;
    this._mousePointerId = null;
    this._touches = new Map(); // pointerId -> {x, y} of active touch points
    this._pinchDistance = 0;
    this._disposed = false;

    // Without this the browser claims touch drags for scrolling and
    // pinches for page zoom before the pointer events reach us.
    claimTouchAction(domElement);

    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);
    this._onWheel = this._handleWheel.bind(this);

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
    domElement.addEventListener('contextmenu', this._onContextMenu);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _handlePointerDown(event) {
    if (!this.enabled) return;
    if (event.pointerType !== MOUSE_POINTER_TYPE) {
      this._touches.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (this._touches.size === TWO_TOUCHES) {
        const [first, second] = this._touches.values();
        this._pinchDistance = Math.hypot(
          first.x - second.x,
          first.y - second.y,
        );
      }
      this.domElement.setPointerCapture(event.pointerId);
      return;
    }

    this._dragging = true;
    this._mousePointerId = event.pointerId;
    this._panning = event.button === RIGHT_MOUSE_BUTTON;
    this._leftDrag = event.button === LEFT_MOUSE_BUTTON;
    if (this._panning) this._panDistance = 0;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this.domElement.setPointerCapture(event.pointerId);
  }

  _handlePointerMove(event) {
    if (!this.enabled) return;
    if (event.pointerType !== MOUSE_POINTER_TYPE) {
      this._touchMove(event);
      return;
    }
    if (!this._dragging || event.pointerId !== this._mousePointerId) return;

    const dx = event.clientX - this._lastX;
    const dy = event.clientY - this._lastY;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    if (this._panning) {
      this._panDistance += Math.abs(dx) + Math.abs(dy);
      this._pan(dx, dy);
    } else if (this._leftDrag && event.altKey && this.enableRotate) {
      // Alt is checked per move event, so pressing it mid-drag starts
      // rotating and releasing it pauses.
      this._rotate(dx * this.rotateSpeed, dy * this.rotateSpeed);
    }
  }

  _handlePointerUp(event) {
    if (event.pointerType !== MOUSE_POINTER_TYPE) {
      this._touches.delete(event.pointerId);
      // Dropping below two fingers re-arms the pinch for next time.
      this._pinchDistance = 0;
    } else {
      if (event.pointerId !== this._mousePointerId) return;
      this._dragging = false;
      this._mousePointerId = null;
    }
    this._releasePointer(event.pointerId);
  }

  _handleContextMenu(event) {
    if (!this.enabled) return;
    const wasPanGesture = this._panDistance > CONTEXT_MENU_PAN_THRESHOLD;
    if (wasPanGesture || this._touches.size > 0) event.preventDefault();
  }

  _handleWheel(event) {
    if (!this.enabled) return;
    event.preventDefault();
    const factor = Math.exp(event.deltaY * this.zoomSpeed);
    const ndc = this._toNdc(event.clientX, event.clientY);
    this._zoom(factor, ndc.x, ndc.y);
  }

  _releasePointer(pointerId) {
    if (this.domElement.hasPointerCapture(pointerId)) {
      this.domElement.releasePointerCapture(pointerId);
    }
  }

  /** A client-space position in normalized device coordinates (-1..1). */
  _toNdc(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * NDC_SPAN - 1,
      y: 1 - ((clientY - rect.top) / rect.height) * NDC_SPAN,
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
      if (
        this.singleTouchGesture === TOUCH_GESTURE.ROTATE &&
        this.enableRotate
      ) {
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
    if (this._disposed) return;
    this._disposed = true;
    if (this._mousePointerId !== null) {
      this._releasePointer(this._mousePointerId);
      this._mousePointerId = null;
    }
    for (const pointerId of this._touches.keys()) {
      this._releasePointer(pointerId);
    }
    this._touches.clear();
    this._dragging = false;
    this._pinchDistance = 0;
    releaseTouchAction(this.domElement);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('wheel', this._onWheel);
  }
}
