import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Frustum as PublicFrustum } from '../src/index.js';
import { Frustum } from '../src/math/Frustum.js';
import { Mat4 } from '../src/math/Mat4.js';
import { Vec3 } from '../src/math/Vec3.js';
import { PerspectiveCamera } from '../src/3d/cameras/PerspectiveCamera.js';
import { OrthographicCamera } from '../src/3d/cameras/OrthographicCamera.js';
import { InstancedMesh } from '../src/3d/core/InstancedMesh.js';
import { Mesh } from '../src/3d/core/Mesh.js';
import { Renderer } from '../src/3d/core/Renderer.js';
import { Scene } from '../src/3d/core/Scene.js';
import { BoxGeometry } from '../src/3d/geometries/BoxGeometry.js';
import { Geometry } from '../src/3d/geometries/Geometry.js';
import { BasicMaterial } from '../src/3d/materials/BasicMaterial.js';

const UNIT_BOX = Object.freeze({
  min: Object.freeze([-0.5, -0.5, -0.5]),
  max: Object.freeze([0.5, 0.5, 0.5]),
});

test('Frustum is public and extracts WebGPU perspective depth planes', () => {
  assert.equal(PublicFrustum, Frustum);
  const camera = perspectiveCamera();
  const frustum = new Frustum().setFromViewProjectionMatrix(
    camera.viewProjectionMatrix,
  );

  assert.equal(frustum.intersectsBox(boxAt(0, 0, -2)), true);
  // Between the eye and near=1. This fails with OpenGL's z+w near plane.
  assert.equal(
    frustum.intersectsBox({
      min: [-0.1, -0.1, -0.6],
      max: [0.1, 0.1, -0.4],
    }),
    false,
  );
  assert.equal(
    frustum.intersectsBox({
      min: [-0.1, -0.1, -1.2],
      max: [0.1, 0.1, -1],
    }),
    true,
  );
  assert.equal(frustum.intersectsBox(boxAt(0, 0, -11)), false);
  assert.equal(frustum.intersectsBox(boxAt(5, 0, -2)), false);
  assert.equal(frustum.intersectsBox(boxAt(-5, 0, -2)), false);
  assert.equal(frustum.intersectsBox(boxAt(0, 5, -2)), false);
  assert.equal(frustum.intersectsBox(boxAt(0, -5, -2)), false);
  assert.equal(frustum.intersectsBox(boxAt(0, 0, 2)), false);
});

test('orthographic frustum follows aspect and keeps tangent boxes', () => {
  const camera = orthographicCamera(2, 1);
  const frustum = new Frustum().setFromViewProjectionMatrix(
    camera.viewProjectionMatrix,
  );

  assert.equal(frustum.intersectsBox(boxAt(0, 0, -3)), true);
  assert.equal(frustum.intersectsBox(boxAt(3, 0, -3)), false);
  assert.equal(
    frustum.intersectsBox({
      min: [2, -0.25, -3.25],
      max: [2.5, 0.25, -2.75],
    }),
    true,
  );

  camera.aspect = 2;
  camera.updateMatrices();
  frustum.setFromViewProjectionMatrix(camera.viewProjectionMatrix);
  assert.equal(frustum.intersectsBox(boxAt(3, 0, -3)), true);

  camera.zoom = 2;
  camera.updateMatrices();
  frustum.setFromViewProjectionMatrix(camera.viewProjectionMatrix);
  assert.equal(frustum.intersectsBox(boxAt(3, 0, -3)), false);
});

test('transformed boxes are culled conservatively without matrix inversion', () => {
  const camera = orthographicCamera(2, 1);
  const frustum = new Frustum().setFromViewProjectionMatrix(
    camera.viewProjectionMatrix,
  );
  const transform = new Mat4().compose(
    new Vec3(2.6, 0, -3),
    new Vec3(0, Math.PI / 4, 0),
    new Vec3(-2, 0.5, 1),
  );

  // Its origin is outside x=2, but the rotated/scaled box overlaps the view.
  assert.equal(frustum.intersectsBox(UNIT_BOX, transform), true);
  transform.compose(
    new Vec3(5, 0, -3),
    new Vec3(0, Math.PI / 4, 0),
    new Vec3(-2, 0.5, 1),
  );
  assert.equal(frustum.intersectsBox(UNIT_BOX, transform), false);

  // A singular transform is still safe: no inverse is needed.
  transform.compose(
    new Vec3(0, 0, -3),
    new Vec3(),
    new Vec3(0, 1, 1),
  );
  assert.equal(frustum.intersectsBox(UNIT_BOX, transform), true);
});

test('invalid frustum inputs fail open while empty boxes remain culled', () => {
  const frustum = new Frustum();
  assert.equal(frustum.intersectsBox(UNIT_BOX), true);

  frustum.setFromViewProjectionMatrix(new Mat4());
  assert.equal(
    frustum.intersectsBox({ min: [NaN, 0, 0], max: [1, 1, 1] }),
    true,
  );
  assert.equal(
    frustum.intersectsBox({ min: [1, 0, 0], max: [-1, 1, 1] }),
    false,
  );

  const invalidTransform = new Mat4();
  invalidTransform.elements[0] = Infinity;
  assert.equal(frustum.intersectsBox(UNIT_BOX, invalidTransform), true);

  const invalidProjection = new Mat4();
  invalidProjection.elements[0] = NaN;
  frustum.setFromViewProjectionMatrix(invalidProjection);
  assert.equal(frustum.valid, false);
  assert.equal(frustum.intersectsBox(UNIT_BOX), true);
});

test('InstancedMesh caches and invalidates conservative batch bounds', () => {
  const geometry = twoPointGeometry(-0.5, 0.5);
  const mesh = new InstancedMesh(geometry, new BasicMaterial(), 2);
  const matrix = new Mat4();
  mesh.setMatrixAt(0, matrix.makeTranslation(10, 0, 0));
  mesh.setMatrixAt(1, matrix.makeTranslation(12, 0, 0));

  const outsideBounds = mesh.bounds;
  assert.deepEqual(outsideBounds, {
    min: [9.5, -0.5, -0.5],
    max: [12.5, 0.5, 0.5],
  });
  assert.equal(mesh.bounds, outsideBounds);

  mesh.setMatrixAt(0, matrix.identity());
  const mixedBounds = mesh.bounds;
  assert.notEqual(mixedBounds, outsideBounds);
  assert.deepEqual(mixedBounds.min, [-0.5, -0.5, -0.5]);
  assert.deepEqual(mixedBounds.max, [12.5, 0.5, 0.5]);
  mesh.setColorAt(0, [0.5, 0.5, 0.5]);
  assert.equal(mesh.bounds, mixedBounds);

  mesh.instanceData[12] = 20;
  mesh.needsUpdate = true;
  assert.equal(mesh.bounds.min[0], 11.5);
  assert.equal(mesh.bounds.max[0], 20.5);

  geometry.vertices[0] = -2;
  geometry.vertices[8] = 2;
  geometry.needsUpdate = true;
  assert.equal(mesh.bounds.min[0], 10);
  assert.equal(mesh.bounds.max[0], 22);
});

test('InstancedMesh keeps unknown projective bounds visible', () => {
  const mesh = new InstancedMesh(
    new BoxGeometry(),
    new BasicMaterial(),
    1,
  );
  mesh.instanceData[3] = 0.25;
  mesh.needsUpdate = true;
  assert.equal(mesh.bounds, null);

  // Small projective terms are not approximately affine: after the GPU's
  // homogeneous divide they can still move distant geometry substantially.
  mesh.instanceData[3] = 5e-8;
  mesh.needsUpdate = true;
  assert.equal(mesh.bounds, null);

  const empty = new InstancedMesh(
    new BoxGeometry(),
    new BasicMaterial(),
    0,
  );
  assert.deepEqual(empty.bounds, {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  });
});

test('renderer culls color meshes and supports a per-mesh opt-out', () => {
  const scene = new Scene();
  const geometry = new BoxGeometry();
  const inside = meshAt(geometry, 0, 0, -3);
  const outside = meshAt(geometry, 20, 0, -3);
  const visibleChild = meshAt(geometry, -20, 0, 0);
  outside.add(visibleChild);
  const forced = meshAt(geometry, -20, 0, -3);
  forced.frustumCulled = false;
  const hidden = meshAt(geometry, 0, 0, -3);
  hidden.visible = false;
  const transparent = meshAt(geometry, 0, 0, -5, true);
  scene.add(inside).add(outside).add(forced).add(hidden).add(transparent);

  const renderer = new Renderer({});
  renderer._shadowMap = { enabled: false };
  const camera = perspectiveCamera();
  scene.updateWorldMatrix();
  renderer._collectMeshes(scene, camera);

  assert.equal(inside.frustumCulled, true);
  // Culling a Mesh does not prune children whose own bounds are visible.
  assert.deepEqual(renderer._opaqueList, [inside, visibleChild, forced]);
  assert.deepEqual(renderer._transparentList, [transparent]);
  assert.equal(renderer.drawCount, 4);
});

test('instanced batches draw fully when any instance intersects', () => {
  const scene = new Scene();
  const geometry = new BoxGeometry();
  const material = new BasicMaterial();
  const outside = new InstancedMesh(geometry, material, 2);
  const mixed = new InstancedMesh(geometry, material, 3);
  const matrix = new Mat4();
  outside.setMatrixAt(0, matrix.makeTranslation(20, 0, -3));
  outside.setMatrixAt(1, matrix.makeTranslation(22, 0, -3));
  mixed.setMatrixAt(0, matrix.makeTranslation(20, 0, -3));
  mixed.setMatrixAt(1, matrix.makeTranslation(0, 0, -3));
  mixed.setMatrixAt(2, matrix.makeTranslation(22, 0, -3));
  scene.add(outside).add(mixed);

  const renderer = new Renderer({});
  renderer._shadowMap = { enabled: false };
  const camera = perspectiveCamera();
  scene.updateWorldMatrix();
  renderer._collectMeshes(scene, camera);

  assert.deepEqual(renderer._opaqueList, [mixed]);
  assert.equal(renderer.drawCount, 3);
});

test('main and directional shadow frusta collect meshes independently', () => {
  const scene = new Scene();
  const geometry = new BoxGeometry();
  const offCameraCaster = meshAt(geometry, 5, 0, -3);
  offCameraCaster.castShadow = true;
  const transparentCaster = meshAt(geometry, 5, 0, -3, true);
  transparentCaster.castShadow = true;
  const lineCaster = new Mesh(
    geometry,
    new BasicMaterial({ topology: 'line-list' }),
  );
  lineCaster.position.set(5, 0, -3);
  lineCaster.castShadow = true;
  const outsideBoth = meshAt(geometry, 20, 0, -3);
  outsideBoth.castShadow = true;
  scene
    .add(offCameraCaster)
    .add(transparentCaster)
    .add(lineCaster)
    .add(outsideBoth);

  const mainCamera = orthographicCamera(2, 1);
  const shadowCamera = orthographicCamera(2, 1);
  shadowCamera.position.set(5, 0, 0);
  shadowCamera.lookAt(5, 0, -1);
  shadowCamera.updateMatrices();
  scene.updateWorldMatrix();

  const renderer = new Renderer({});
  renderer._shadowMap = { enabled: true };
  renderer._collectMeshes(scene, mainCamera, shadowCamera);

  assert.deepEqual(renderer._opaqueList, []);
  assert.deepEqual(renderer._transparentList, []);
  // Shadow maps only accept opaque triangle topologies.
  assert.deepEqual(renderer._shadowMeshList, [offCameraCaster]);
  assert.equal(renderer.drawCount, 0);

  outsideBoth.frustumCulled = false;
  renderer._collectMeshes(scene, mainCamera, shadowCamera);
  assert.deepEqual(renderer._opaqueList, [outsideBoth]);
  assert.deepEqual(
    renderer._shadowMeshList,
    [offCameraCaster, outsideBoth],
  );
});

function perspectiveCamera() {
  const camera = new PerspectiveCamera(90, 1, 1, 10);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrices();
  return camera;
}

function orthographicCamera(size, aspect) {
  const camera = new OrthographicCamera(size, aspect, 1, 10);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrices();
  return camera;
}

function boxAt(x, y, z, halfSize = 0.5) {
  return {
    min: [x - halfSize, y - halfSize, z - halfSize],
    max: [x + halfSize, y + halfSize, z + halfSize],
  };
}

function meshAt(geometry, x, y, z, transparent = false) {
  const mesh = new Mesh(
    geometry,
    new BasicMaterial({ transparent }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

function twoPointGeometry(minimum, maximum) {
  return new Geometry(
    [
      minimum, -0.5, -0.5, 0, 0, 1, 0, 0,
      maximum, 0.5, 0.5, 0, 0, 1, 1, 1,
    ],
    [0, 1],
  );
}
