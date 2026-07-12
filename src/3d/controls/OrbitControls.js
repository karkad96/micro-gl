import { PointerControls } from '../../core/PointerControls.js';

/**
 * Mouse / touch controls that orbit a camera around a target point.
 * Alt + left-drag to rotate, right-drag to pan, scroll (or pinch-zoom
 * trackpad) to dolly in and out. A right-click without dragging still
 * opens the browser context menu. On touch screens: one-finger drag
 * orbits, two-finger drag pans, pinch zooms.
 *
 * The gesture plumbing lives in PointerControls; this class is the
 * orbit math. Call `controls.update()` once per frame before rendering.
 */
export class OrbitControls extends PointerControls {
  constructor(camera, domElement) {
    super(domElement);
    this.camera = camera;
    this.singleTouchGesture = 'rotate';

    // Shares the camera's target so lookAt stays in sync.
    this.target = camera.target;

    this.minRadius = 0.5;
    this.maxRadius = 100;
    this.minZoom = 0.1;
    this.maxZoom = 20;
    this.minPhi = 0.05;
    this.maxPhi = Math.PI - 0.05;

    // Spherical coordinates derived from the camera's starting position.
    const dx = camera.position.x - this.target.x;
    const dy = camera.position.y - this.target.y;
    const dz = camera.position.z - this.target.z;
    this.radius = Math.max(Math.hypot(dx, dy, dz), this.minRadius);
    this.theta = Math.atan2(dx, dz);
    this.phi = Math.acos(Math.min(Math.max(dy / this.radius, -1), 1));
  }

  /**
   * Half the height of the view volume at the target's distance,
   * in world units.
   */
  _visibleHalfHeight() {
    return this.camera.isOrthographic
      ? this.camera.size / this.camera.zoom
      : this.radius * Math.tan((this.camera.fov * Math.PI) / 360);
  }

  _rotate(rx, ry) {
    this.theta -= rx;
    this.phi = Math.min(Math.max(this.phi - ry, this.minPhi), this.maxPhi);
  }

  /**
   * Moves the target along the camera's screen-space axes so the scene
   * follows the cursor (1 pixel of drag = 1 pixel on screen).
   */
  _pan(dx, dy) {
    const e = this.camera.worldMatrix.elements;
    const worldPerPixel =
      (2 * this._visibleHalfHeight()) / this.domElement.clientHeight;
    // Columns 0 and 1 of the world matrix are the camera's right/up axes.
    this.target.x -= (e[0] * dx - e[4] * dy) * worldPerPixel;
    this.target.y -= (e[1] * dx - e[5] * dy) * worldPerPixel;
    this.target.z -= (e[2] * dx - e[6] * dy) * worldPerPixel;
  }

  _zoom(factor, ndcX, ndcY) {
    const halfHBefore = this._visibleHalfHeight();
    if (this.camera.isOrthographic) {
      // Dollying doesn't change apparent size in ortho; scale the
      // camera's zoom instead.
      this.camera.zoom /= factor;
      this.camera.zoom = Math.min(
        Math.max(this.camera.zoom, this.minZoom),
        this.maxZoom,
      );
    } else {
      this.radius *= factor;
      this.radius = Math.min(
        Math.max(this.radius, this.minRadius),
        this.maxRadius,
      );
    }

    // Zoom toward the cursor: shift the target so the world point
    // under the pointer stays under it as the view scales.
    const dh = halfHBefore - this._visibleHalfHeight();
    const ox = ndcX * dh * this.camera.aspect;
    const oy = ndcY * dh;
    const m = this.camera.worldMatrix.elements;
    this.target.x += m[0] * ox + m[4] * oy;
    this.target.y += m[1] * ox + m[5] * oy;
    this.target.z += m[2] * ox + m[6] * oy;
  }

  /** Applies the current orbit state to the camera. Call once per frame. */
  update() {
    // Keep an imperceptible tilt so that even at phi = 0 (straight
    // top-down) the camera's screen orientation follows theta, letting
    // the view spin around the vertical axis.
    const phi = Math.max(this.phi, 1e-4);
    const sinPhi = Math.sin(phi);
    this.camera.position.set(
      this.target.x + this.radius * sinPhi * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(phi),
      this.target.z + this.radius * sinPhi * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }
}
