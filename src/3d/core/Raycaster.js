import { Vec3 } from '../../math/Vec3.js';
import { Mat4 } from '../../math/Mat4.js';
import {
  DEFAULT_PRIMITIVE_TOPOLOGY,
  isTriangleTopology,
} from '../../core/pipelineConstants.js';
import { INSTANCE_SIZE } from '../constants.js';
import { Mesh } from './Mesh.js';
import { copyAffineInstanceMatrix } from './InstanceMatrix.js';
import {
  intersectIndexedGeometry,
  intersectsBounds,
} from './RayIntersection.js';

const _invVP = new Mat4();
const _invWorld = new Mat4();
const _instanceMatrix = new Mat4();
const _combinedMatrix = new Mat4();
const _localOrigin = new Vec3();
const _localDirection = new Vec3();
const _farPoint = new Vec3();
const _worldDirection = new Vec3();

const DIRECTION_EPSILON = 1e-12;

function isVisibleInHierarchy(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

/**
 * Casts a ray from the camera through a screen point and finds which
 * indexed triangle surfaces it hits. Local bounds provide a fast broad
 * phase; triangle tests determine the final hit. Instanced meshes are tested
 * one transform at a time and report the matching `instanceId`.
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
   * subtrees). Returns the nearest surface hit per mesh or per instance as
   * `{ object, point, distance }`, globally sorted nearest first. Instanced
   * hits additionally contain a zero-based `instanceId`.
   */
  intersectObjects(objects) {
    const hits = [];
    if (!prepareRay(this, _worldDirection)) return hits;
    const visitedMeshes = new Set();

    for (const root of objects) {
      // Callers commonly pass pickable children directly, so account for
      // invisible ancestors outside the traversed subtree as well.
      if (!isVisibleInHierarchy(root)) continue;
      root.traverseVisible((object) => {
        if (
          object instanceof Mesh &&
          object.geometry &&
          !visitedMeshes.has(object)
        ) {
          visitedMeshes.add(object);
          this._appendMeshHits(object, hits);
        }
      });
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }

  _appendMeshHits(mesh, hits) {
    const topology =
      mesh.material?.topology ?? DEFAULT_PRIMITIVE_TOPOLOGY;
    if (!isTriangleTopology(topology)) return;

    if (!mesh.isInstanced) {
      const hit = this._intersectGeometry(mesh, mesh.worldMatrix, topology);
      if (hit) hits.push(hit);
      return;
    }

    const batchBounds = mesh.bounds;
    if (
      batchBounds &&
      !this._intersectsTransformedBounds(batchBounds, mesh.worldMatrix)
    ) {
      return;
    }

    const availableInstances = Math.floor(
      (mesh.instanceData?.length || 0) / INSTANCE_SIZE,
    );
    const instanceCount = Number.isInteger(mesh.count)
      ? Math.min(Math.max(mesh.count, 0), availableInstances)
      : 0;
    for (let instanceId = 0; instanceId < instanceCount; instanceId++) {
      if (
        !copyAffineInstanceMatrix(
          mesh.instanceData,
          instanceId,
          _instanceMatrix,
        )
      ) {
        continue;
      }
      _combinedMatrix.multiplyMatrices(mesh.worldMatrix, _instanceMatrix);
      const hit = this._intersectGeometry(mesh, _combinedMatrix, topology);
      if (hit) {
        hit.instanceId = instanceId;
        hits.push(hit);
      }
    }
  }

  _intersectGeometry(mesh, transform, topology) {
    if (!this._transformRay(transform)) return null;

    const distance = intersectIndexedGeometry(
      _localOrigin,
      _localDirection,
      mesh.geometry,
      topology,
      this.maxDistance,
    );
    if (distance === null) return null;

    const point = new Vec3(
      this.origin.x + _worldDirection.x * distance,
      this.origin.y + _worldDirection.y * distance,
      this.origin.z + _worldDirection.z * distance,
    );
    return { object: mesh, point, distance };
  }

  _intersectsTransformedBounds(bounds, transform) {
    return (
      this._transformRay(transform) &&
      intersectsBounds(
        _localOrigin,
        _localDirection,
        bounds,
        this.maxDistance,
      )
    );
  }

  _transformRay(transform) {
    if (!_invWorld.copy(transform).tryInvert()) return false;

    // Transform a unit world-ray step into local space. Leaving the resulting
    // direction unnormalized keeps intersection distances in world units,
    // including under rotated and non-uniformly scaled transforms.
    _localOrigin.copy(this.origin).applyMat4(_invWorld);
    _localDirection
      .set(
        this.origin.x + _worldDirection.x,
        this.origin.y + _worldDirection.y,
        this.origin.z + _worldDirection.z,
      )
      .applyMat4(_invWorld)
      .sub(_localOrigin);

    return (
      Number.isFinite(_localOrigin.x) &&
      Number.isFinite(_localOrigin.y) &&
      Number.isFinite(_localOrigin.z) &&
      Number.isFinite(_localDirection.x) &&
      Number.isFinite(_localDirection.y) &&
      Number.isFinite(_localDirection.z)
    );
  }
}

function prepareRay(raycaster, targetDirection) {
  const directionLength = raycaster.direction.length();
  const validMaxDistance =
    raycaster.maxDistance === Infinity ||
    (Number.isFinite(raycaster.maxDistance) && raycaster.maxDistance >= 0);
  if (
    !Number.isFinite(raycaster.origin.x) ||
    !Number.isFinite(raycaster.origin.y) ||
    !Number.isFinite(raycaster.origin.z) ||
    !Number.isFinite(directionLength) ||
    directionLength <= DIRECTION_EPSILON ||
    !validMaxDistance
  ) {
    return false;
  }
  targetDirection
    .copy(raycaster.direction)
    .multiplyScalar(1 / directionLength);
  return true;
}
