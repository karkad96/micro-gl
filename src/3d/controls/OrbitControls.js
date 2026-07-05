/**
 * Mouse / touch controls that orbit a camera around a target point.
 * Alt + left-drag to rotate, right-drag to pan, scroll (or pinch-zoom
 * trackpad) to dolly in and out. A right-click without dragging still
 * opens the browser context menu.
 *
 * Call `controls.update()` once per frame before rendering.
 */
export class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Shares the camera's target so lookAt stays in sync.
    this.target = camera.target;

    /** Set to false to ignore input, e.g. while dragging an object. */
    this.enabled = true;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.001;
    /** Set to false to disable orbiting (panning and zoom still work). */
    this.enableRotate = true;
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

    this._dragging = false;
    this._panning = false;
    this._leftDrag = false;
    this._panDistance = 0;
    this._lastX = 0;
    this._lastY = 0;

    this._onPointerDown = (e) => {
      this._dragging = true;
      // Right button pans; Alt + left button orbits.
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
        this.theta -= dx * this.rotateSpeed;
        this.phi -= dy * this.rotateSpeed;
        this.phi = Math.min(Math.max(this.phi, this.minPhi), this.maxPhi);
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
      if (this._panDistance > 3) e.preventDefault();
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
    };

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
    domElement.addEventListener('contextmenu', this._onContextMenu);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
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

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('wheel', this._onWheel);
  }
}
