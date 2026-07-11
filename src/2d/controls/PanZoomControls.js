import { PointerControls } from '../../core/PointerControls.js';

/**
 * Mouse / touch controls for a Camera2d: right-drag to pan, scroll to
 * zoom (toward the cursor), Alt + left-drag to spin the view. A
 * right-click without dragging still opens the browser context menu.
 * On touch screens: drag with one or two fingers to pan, pinch to zoom.
 *
 * The same gestures as OrbitControls (both inherit the plumbing from
 * PointerControls), minus the orbit — and because a 2D camera has no
 * derived state, the handlers modify it directly, so there is no
 * per-frame update() to call.
 */
export class PanZoomControls extends PointerControls {
  constructor(camera, domElement) {
    super(domElement);
    this.camera = camera;

    this.minZoom = 0.1;
    this.maxZoom = 20;
  }

  /** Half the height of the visible area, in world units. */
  _visibleHalfHeight() {
    return this.camera.size / this.camera.zoom;
  }

  _rotate(rx) {
    this.camera.rotation += rx;
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

  _zoom(factor, ndcX, ndcY) {
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
  }
}
