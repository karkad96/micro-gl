import { Vec3 } from '../../math/Vec3.js';
import { Mat4 } from '../../math/Mat4.js';
import { Mesh } from './Mesh.js';

const _invVP = new Mat4();
const _invWorld = new Mat4();
const _localOrigin = new Vec3();
const _localEnd = new Vec3();

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
  }

  /**
   * Builds the ray going through a screen point, for both perspective
   * and orthographic cameras.
   * @param {number} ndcX pointer x in normalized device coords (-1..1)
   * @param {number} ndcY pointer y in normalized device coords (-1..1)
   */
  setFromCamera(ndcX, ndcY, camera) {
    _invVP.copy(camera.viewProjectionMatrix).invert();
    this.origin.set(ndcX, ndcY, 0).applyMat4(_invVP);
    this.direction.set(ndcX, ndcY, 1).applyMat4(_invVP);
    this.direction.sub(this.origin).normalize();
    return this;
  }

  /**
   * Intersects the ray with an array of objects (meshes and/or scene-graph
   * subtrees). Returns hits as `{ object, point, distance }`, nearest first.
   */
  intersectObjects(objects) {
    const hits = [];
    for (const root of objects) {
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
    // Transform the ray into the mesh's local space, where the bounding
    // box is axis-aligned. The local direction is left unnormalized so
    // `t` stays consistent between the two spaces.
    _invWorld.copy(mesh.worldMatrix).invert();
    _localOrigin.copy(this.origin).applyMat4(_invWorld);
    _localEnd.copy(this.origin).add(this.direction).applyMat4(_invWorld);
    const dir = _localEnd.sub(_localOrigin);

    const { min, max } = mesh.geometry.bounds;
    const o = [_localOrigin.x, _localOrigin.y, _localOrigin.z];
    const d = [dir.x, dir.y, dir.z];

    // Slab test against the local AABB.
    let tMin = -Infinity;
    let tMax = Infinity;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-12) {
        if (o[a] < min[a] || o[a] > max[a]) return null;
        continue;
      }
      let t1 = (min[a] - o[a]) / d[a];
      let t2 = (max[a] - o[a]) / d[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }
    if (tMax < 0) return null; // box is entirely behind the ray

    const t = tMin >= 0 ? tMin : tMax;
    const point = new Vec3(
      this.origin.x + this.direction.x * t,
      this.origin.y + this.direction.y * t,
      this.origin.z + this.direction.z * t,
    );
    // `direction` is normalized, so t is already the world-space distance.
    return { object: mesh, point, distance: t };
  }
}
