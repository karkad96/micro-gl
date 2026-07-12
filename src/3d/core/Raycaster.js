import { Vec3 } from '../../math/Vec3.js';
import { Mat4 } from '../../math/Mat4.js';
import { Mesh } from './Mesh.js';

const _invVP = new Mat4();
const _invWorld = new Mat4();
const _localOrigin = new Vec3();
const _localEnd = new Vec3();
const _farPoint = new Vec3();

const DIRECTION_EPSILON = 1e-12;

function isVisibleInHierarchy(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

/**
 * Casts a ray from the camera through a screen point and finds which
 * meshes it hits. Intersection uses each geometry's local-space bounding
 * box (transformed by the mesh's world matrix), which is exact for boxes
 * and a close fit for the other primitives.
 *
 * Matrices must be up to date, i.e. the scene must have been rendered
 * (the renderer updates them every frame).
 */
export class Raycaster {
  constructor() {
    this.origin = new Vec3();
    this.direction = new Vec3();
    /** Farthest distance accepted by intersectObjects(). */
    this.maxDistance = Infinity;
  }

  /**
   * Configures a world-space ray directly. `direction` may have any non-zero
   * length; intersections normalize it without changing the public vector.
   */
  set(origin, direction, maxDistance = Infinity) {
    this.origin.copy(origin);
    this.direction.copy(direction);
    this.maxDistance = maxDistance;
    return this;
  }

  /**
   * Builds the ray going through a screen point, for both perspective
   * and orthographic cameras.
   * @param {number} ndcX pointer x in normalized device coords (-1..1)
   * @param {number} ndcY pointer y in normalized device coords (-1..1)
   */
  setFromCamera(ndcX, ndcY, camera) {
    if (!_invVP.copy(camera.viewProjectionMatrix).tryInvert()) {
      this.origin.set(0, 0, 0);
      this.direction.set(0, 0, 0);
      this.maxDistance = 0;
      return this;
    }

    this.origin.set(ndcX, ndcY, 0).applyMat4(_invVP);
    _farPoint.set(ndcX, ndcY, 1).applyMat4(_invVP);
    this.direction.copy(_farPoint).sub(this.origin);
    this.maxDistance = this.direction.length();
    const valid =
      Number.isFinite(this.origin.x) &&
      Number.isFinite(this.origin.y) &&
      Number.isFinite(this.origin.z) &&
      Number.isFinite(this.maxDistance) &&
      this.maxDistance > DIRECTION_EPSILON;
    if (valid) {
      this.direction.multiplyScalar(1 / this.maxDistance);
    } else {
      this.direction.set(0, 0, 0);
      this.maxDistance = 0;
    }
    return this;
  }

  /**
   * Intersects the ray with an array of objects (meshes and/or scene-graph
   * subtrees). Returns hits as `{ object, point, distance }`, nearest first.
   */
  intersectObjects(objects) {
    const hits = [];
    for (const root of objects) {
      // Callers commonly pass pickable children directly, so account for
      // invisible ancestors outside the traversed subtree as well.
      if (!isVisibleInHierarchy(root)) continue;
      root.traverseVisible((object) => {
        if (object instanceof Mesh && object.geometry) {
          const hit = this._intersectMesh(object);
          if (hit) hits.push(hit);
        }
      });
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }

  _intersectMesh(mesh) {
    const directionLength = this.direction.length();
    const validMaxDistance =
      this.maxDistance === Infinity ||
      (Number.isFinite(this.maxDistance) && this.maxDistance >= 0);
    if (
      !Number.isFinite(this.origin.x) ||
      !Number.isFinite(this.origin.y) ||
      !Number.isFinite(this.origin.z) ||
      !Number.isFinite(directionLength) ||
      directionLength <= DIRECTION_EPSILON ||
      !validMaxDistance ||
      !_invWorld.copy(mesh.worldMatrix).tryInvert()
    ) {
      return null;
    }

    const directionX = this.direction.x / directionLength;
    const directionY = this.direction.y / directionLength;
    const directionZ = this.direction.z / directionLength;

    // Transform the ray into the mesh's local space, where the bounding
    // box is axis-aligned. The local direction is left unnormalized so
    // `t` stays consistent between the two spaces.
    _localOrigin.copy(this.origin).applyMat4(_invWorld);
    _localEnd
      .set(
        this.origin.x + directionX,
        this.origin.y + directionY,
        this.origin.z + directionZ,
      )
      .applyMat4(_invWorld);
    const dir = _localEnd.sub(_localOrigin);

    if (
      !Number.isFinite(_localOrigin.x) ||
      !Number.isFinite(_localOrigin.y) ||
      !Number.isFinite(_localOrigin.z) ||
      !Number.isFinite(dir.x) ||
      !Number.isFinite(dir.y) ||
      !Number.isFinite(dir.z)
    ) {
      return null;
    }

    const { min, max } = mesh.geometry.bounds;
    const o = [_localOrigin.x, _localOrigin.y, _localOrigin.z];
    const d = [dir.x, dir.y, dir.z];

    // Slab test against the local AABB.
    let tMin = -Infinity;
    let tMax = Infinity;
    for (let axis = 0; axis < min.length; axis++) {
      if (Math.abs(d[axis]) < DIRECTION_EPSILON) {
        if (o[axis] < min[axis] || o[axis] > max[axis]) return null;
        continue;
      }
      let t1 = (min[axis] - o[axis]) / d[axis];
      let t2 = (max[axis] - o[axis]) / d[axis];
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }
    if (tMax < 0) return null; // box is entirely behind the ray

    // When the near-plane origin starts inside the box, use the exit face.
    // Returning zero would put drag planes on the camera's near plane rather
    // than at the visible surface of an enclosing object.
    const t = tMin >= 0 ? tMin : tMax;
    if (t > this.maxDistance) return null;
    const point = new Vec3(
      this.origin.x + directionX * t,
      this.origin.y + directionY * t,
      this.origin.z + directionZ * t,
    );
    // The local calculation used a normalized world direction, so `t` is a
    // world-space distance even when callers supplied a scaled direction.
    return { object: mesh, point, distance: t };
  }
}
