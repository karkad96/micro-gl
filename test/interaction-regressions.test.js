import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec2 } from '../src/math/Vec2.js';
import { Vec3 } from '../src/math/Vec3.js';
import { Mat3 } from '../src/math/Mat3.js';
import { Mat4 } from '../src/math/Mat4.js';
import { Object2d } from '../src/2d/core/Object2d.js';
import { Object3d } from '../src/3d/core/Object3d.js';
import { Shape2d } from '../src/2d/core/Shape2d.js';
import { Mesh } from '../src/3d/core/Mesh.js';
import { InstancedMesh } from '../src/3d/core/InstancedMesh.js';
import { Camera2d } from '../src/2d/cameras/Camera2d.js';
import { PerspectiveCamera } from '../src/3d/cameras/PerspectiveCamera.js';
import { DragControls2d } from '../src/2d/controls/DragControls2d.js';
import { DragControls } from '../src/3d/controls/DragControls.js';
import { OrbitControls } from '../src/3d/controls/OrbitControls.js';
import { Raycaster } from '../src/3d/core/Raycaster.js';
import { RectGeometry } from '../src/2d/geometries/RectGeometry.js';
import { BoxGeometry } from '../src/3d/geometries/BoxGeometry.js';

const EPSILON = 1e-5;

function assertClose(actual, expected, message = '') {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `${message} expected ${expected}, got ${actual}`,
  );
}

class FakeElement {
  constructor() {
    this.style = {};
    this.clientHeight = 100;
    this._listeners = new Map();
    this._capturedPointers = new Set();
  }

  addEventListener(type, handler) {
    this._listeners.set(type, handler);
  }

  removeEventListener(type) {
    this._listeners.delete(type);
  }

  dispatch(type, event) {
    this._listeners.get(type)?.(event);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }

  setPointerCapture(pointerId) {
    this._capturedPointers.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this._capturedPointers.delete(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this._capturedPointers.has(pointerId);
  }
}

function pointer(pointerId, clientX = 50, clientY = 50) {
  return {
    pointerId,
    pointerType: 'touch',
    button: 0,
    altKey: false,
    clientX,
    clientY,
  };
}

function makePerspectiveCamera(far = 100) {
  const camera = new PerspectiveCamera(60, 1, 0.1, far);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrices();
  return camera;
}

test('camera-mounted children inherit the final look-at orientation', () => {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 5);
  camera.lookAt(1, 0, 5);
  const attachment = new Object3d();
  attachment.position.set(0, 0, -1);
  camera.add(attachment);

  // This is the same update order used by Renderer.render().
  camera.updateWorldMatrix();
  camera.updateMatrices();

  const world = attachment.worldMatrix.elements;
  assertClose(world[12], 1, 'attachment x:');
  assertClose(world[13], 0, 'attachment y:');
  assertClose(world[14], 5, 'attachment z:');
});

test('camera rays stop at the far clipping plane', () => {
  const camera = makePerspectiveCamera(10);
  const inside = new Mesh(new BoxGeometry(1, 1, 1), {});
  inside.position.set(0, 0, -4);
  inside.updateWorldMatrix();
  const clipped = new Mesh(new BoxGeometry(1, 1, 1), {});
  clipped.position.set(0, 0, -20);
  clipped.updateWorldMatrix();

  const hits = new Raycaster()
    .setFromCamera(0, 0, camera)
    .intersectObjects([inside, clipped]);

  assert.deepEqual(
    hits.map((hit) => hit.object),
    [inside],
  );
});

test('a ray starting inside a mesh hits its exit surface', () => {
  const camera = makePerspectiveCamera();
  const enclosing = new Mesh(new BoxGeometry(20, 20, 20), {});
  enclosing.updateWorldMatrix();

  const [hit] = new Raycaster()
    .setFromCamera(0, 0, camera)
    .intersectObjects([enclosing]);

  assert.ok(hit);
  assertClose(hit.point.z, -10, 'exit point:');
  assertClose(hit.distance, 14.9, 'exit distance:');
});

test('manually configured public rays remain supported and normalized', () => {
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), {});
  mesh.updateWorldMatrix();
  const raycaster = new Raycaster();
  raycaster.origin.set(0, 0, 5);
  raycaster.direction.set(0, 0, -10);

  const [directHit] = raycaster.intersectObjects([mesh]);
  assert.ok(directHit);
  assertClose(directHit.point.z, 1, 'direct hit:');
  assertClose(directHit.distance, 4, 'direct distance:');

  const [setHit] = raycaster
    .set(new Vec3(0, 0, 5), new Vec3(0, 0, -2), 4)
    .intersectObjects([mesh]);
  assert.ok(setHit);
  assertClose(setHit.distance, 4, 'set distance:');
});

test('raycasting skips singular transforms and directly passed hidden children', () => {
  const camera = makePerspectiveCamera();
  const raycaster = new Raycaster().setFromCamera(0, 0, camera);

  const singular = new Mesh(new BoxGeometry(2, 2, 2), {});
  singular.position.set(100, 0, 0);
  singular.scale.set(0, 1, 1);
  singular.updateWorldMatrix();
  assert.equal(raycaster.intersectObjects([singular]).length, 0);

  const hiddenParent = new Object3d();
  const hiddenChild = new Mesh(new BoxGeometry(2, 2, 2), {});
  hiddenParent.add(hiddenChild);
  hiddenParent.visible = false;
  hiddenParent.updateWorldMatrix();
  assert.equal(raycaster.intersectObjects([hiddenChild]).length, 0);
});

test('2D picking skips singular transforms and directly passed hidden children', () => {
  const camera = new Camera2d();
  camera.updateMatrices();
  const element = new FakeElement();

  const singular = new Shape2d(new RectGeometry(2, 2), {});
  singular.position.set(100, 0);
  singular.scale.set(0, 1);
  singular.updateWorldMatrix();
  const singularControls = new DragControls2d([singular], camera, element);
  assert.equal(singularControls._pick(new Vec2(0, 0)), null);
  singularControls.dispose();

  const hiddenParent = new Object2d();
  const hiddenChild = new Shape2d(new RectGeometry(2, 2), {});
  hiddenParent.add(hiddenChild);
  hiddenParent.visible = false;
  hiddenParent.updateWorldMatrix();
  const hiddenControls = new DragControls2d([hiddenChild], camera, element);
  assert.equal(hiddenControls._pick(new Vec2(0, 0)), null);
  hiddenControls.dispose();
});

test('3D dragging is owned by the pointer that started it', () => {
  const camera = makePerspectiveCamera();
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), {});
  mesh.updateWorldMatrix();
  const element = new FakeElement();
  const controls = new DragControls([mesh], camera, element);
  let starts = 0;
  let ends = 0;
  controls.onDragStart = () => starts++;
  controls.onDragEnd = () => ends++;

  element.dispatch('pointerdown', pointer(1));
  element.dispatch('pointerdown', pointer(2, 0, 0));
  element.dispatch('pointermove', pointer(2, 75));
  element.dispatch('pointerup', pointer(2, 75));

  assert.equal(starts, 1);
  assert.equal(ends, 0);
  assert.equal(controls.selected, mesh);
  assertClose(mesh.position.x, 0);

  element.dispatch('pointermove', pointer(1, 75));
  element.dispatch('pointerup', pointer(1, 75));
  assert.ok(mesh.position.x > 0);
  assert.equal(ends, 1);
  controls.dispose();
});

test('DragControls selects a translated instance without moving the batch', () => {
  const camera = makePerspectiveCamera();
  const instances = new InstancedMesh(new BoxGeometry(), {}, 1);
  instances.setMatrixAt(0, new Mat4().makeTranslation(2, 0, 0));
  instances.updateWorldMatrix();
  const element = new FakeElement();
  const controls = new DragControls([instances], camera, element);

  assert.equal(
    controls._pick(pointer(1)),
    null,
    'the empty base-mesh origin is not pickable',
  );

  const instanceCenterNdc = new Vec3(2, 0, 0).applyMat4(
    camera.viewProjectionMatrix,
  );
  const event = pointer(
    1,
    (instanceCenterNdc.x + 1) * 50,
    (1 - instanceCenterNdc.y) * 50,
  );
  element.dispatch('pointerdown', event);
  assert.equal(controls.selected, instances);

  element.dispatch('pointermove', event);
  assertClose(instances.position.x, 0, 'batch x after stationary move:');
  assertClose(instances.position.y, 0, 'batch y after stationary move:');
  assertClose(instances.position.z, 0, 'batch z after stationary move:');

  element.dispatch('pointerup', event);
  controls.dispose();
});

test('2D dragging is owned by the pointer that started it', () => {
  const camera = new Camera2d();
  camera.updateMatrices();
  const shape = new Shape2d(new RectGeometry(2, 2), {});
  shape.updateWorldMatrix();
  const element = new FakeElement();
  const controls = new DragControls2d([shape], camera, element);
  let starts = 0;
  let ends = 0;
  controls.onDragStart = () => starts++;
  controls.onDragEnd = () => ends++;

  element.dispatch('pointerdown', pointer(1));
  element.dispatch('pointerdown', pointer(2, 0, 0));
  element.dispatch('pointermove', pointer(2, 75));
  element.dispatch('pointerup', pointer(2, 75));

  assert.equal(starts, 1);
  assert.equal(ends, 0);
  assert.equal(controls.selected, shape);
  assertClose(shape.position.x, 0);

  element.dispatch('pointermove', pointer(1, 75));
  element.dispatch('pointerup', pointer(1, 75));
  assert.ok(shape.position.x > 0);
  assert.equal(ends, 1);
  controls.dispose();
});

test('disposing 3D drag controls cleanly ends an active drag', () => {
  const camera = makePerspectiveCamera();
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), {});
  mesh.updateWorldMatrix();
  const element = new FakeElement();
  const controls = new DragControls([mesh], camera, element);
  let ends = 0;
  controls.onDragEnd = () => ends++;

  element.dispatch('pointerdown', pointer(1));
  controls.dispose();

  assert.equal(ends, 1);
  assert.equal(element.hasPointerCapture(1), false);
});

test('disposing 2D drag controls cleanly ends an active drag', () => {
  const camera = new Camera2d();
  camera.updateMatrices();
  const shape = new Shape2d(new RectGeometry(2, 2), {});
  shape.updateWorldMatrix();
  const element = new FakeElement();
  const controls = new DragControls2d([shape], camera, element);
  let ends = 0;
  controls.onDragEnd = () => ends++;

  element.dispatch('pointerdown', pointer(1));
  controls.dispose();

  assert.equal(ends, 1);
  assert.equal(element.hasPointerCapture(1), false);
});

test('OrbitControls clamps its initial radius without changing direction', () => {
  const element = new FakeElement();
  const nearCamera = new PerspectiveCamera();
  nearCamera.position.set(0.1, 0.1, 0);
  const nearControls = new OrbitControls(nearCamera, element);
  nearControls.update();

  const expectedComponent = nearControls.minRadius / Math.sqrt(2);
  assertClose(nearCamera.position.x, expectedComponent);
  assertClose(nearCamera.position.y, expectedComponent);
  assertClose(nearCamera.position.z, 0);
  nearControls.dispose();

  const farCamera = new PerspectiveCamera();
  farCamera.position.set(0, 0, 200);
  const farControls = new OrbitControls(farCamera, element);
  farControls.update();
  assertClose(farCamera.position.z, farControls.maxRadius);
  farControls.dispose();
});

test('targetTo handles a scaled up vector parallel to the view direction', () => {
  const matrix = new Mat4().targetTo(
    new Vec3(0, 0, 5),
    new Vec3(0, 0, 0),
    new Vec3(0, 0, 2),
  );

  const e = matrix.elements;
  const expectedBasis = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  for (let index = 0; index < expectedBasis.length; index++) {
    assertClose(e[index], expectedBasis[index], `basis element ${index}:`);
  }
});

test('Vec3.applyMat4 exposes points whose projective w is zero as non-finite', () => {
  const projection = new Mat4().perspective(Math.PI / 3, 1, 0.1, 100);
  const pointOnCameraPlane = new Vec3(1, 0, 0).applyMat4(projection);
  assert.equal(Number.isFinite(pointOnCameraPlane.x), false);
});

test('tryInvert reports singular matrices without replacing them with identity', () => {
  const matrix3 = new Mat3().makeScale(0, 1);
  const before3 = [...matrix3.elements];
  assert.equal(matrix3.tryInvert(), false);
  assert.deepEqual([...matrix3.elements], before3);

  const matrix4 = new Mat4().makeScale(1, 0, 1);
  const before4 = [...matrix4.elements];
  assert.equal(matrix4.tryInvert(), false);
  assert.deepEqual([...matrix4.elements], before4);
  assert.throws(() => matrix3.invert(), /singular Mat3/);
  assert.throws(() => matrix4.invert(), /singular Mat4/);
});
