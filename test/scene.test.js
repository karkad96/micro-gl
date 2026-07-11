import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object3d } from '../src/3d/core/Object3d.js';
import { Object2d } from '../src/2d/core/Object2d.js';
import { Mesh } from '../src/3d/core/Mesh.js';
import { Raycaster } from '../src/3d/core/Raycaster.js';
import { PerspectiveCamera } from '../src/3d/cameras/PerspectiveCamera.js';
import { BoxGeometry } from '../src/3d/geometries/BoxGeometry.js';
import { VERTEX_SIZE } from '../src/3d/geometries/Geometry.js';
import { CircleGeometry } from '../src/2d/geometries/CircleGeometry.js';
import { RectGeometry } from '../src/2d/geometries/RectGeometry.js';

const EPS = 1e-5;

function assertClose(actual, expected, message = '') {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${message} expected ${expected}, got ${actual}`,
  );
}

test('add() reparents: an object has one parent at a time', () => {
  const a = new Object3d();
  const b = new Object3d();
  const child = new Object3d();
  a.add(child);
  b.add(child);
  assert.equal(child.parent, b);
  assert.deepEqual(a.children, []);
  assert.deepEqual(b.children, [child]);
});

test('add() refuses cycles (self and ancestors) in 3D', () => {
  const parent = new Object3d();
  const child = new Object3d();
  parent.add(child);
  child.add(parent); // would hang traverse if allowed
  parent.add(parent);
  assert.equal(parent.parent, null);
  assert.deepEqual(child.children, []);
  assert.deepEqual(parent.children, [child]);
  let visited = 0;
  parent.traverse(() => visited++);
  assert.equal(visited, 2);
});

test('add() refuses cycles (self and ancestors) in 2D', () => {
  const parent = new Object2d();
  const child = new Object2d();
  parent.add(child);
  child.add(parent);
  parent.add(parent);
  assert.equal(parent.parent, null);
  assert.deepEqual(child.children, []);
  assert.deepEqual(parent.children, [child]);
});

test('updateWorldMatrix chains parent transforms (3D)', () => {
  const parent = new Object3d();
  parent.position.set(1, 0, 0);
  const child = new Object3d();
  child.position.set(0, 2, 0);
  parent.add(child);
  parent.updateWorldMatrix();
  const e = child.worldMatrix.elements;
  assert.deepEqual([e[12], e[13], e[14]], [1, 2, 0]);
});

test('updateWorldMatrix chains parent transforms (2D)', () => {
  const parent = new Object2d();
  parent.position.set(1, 0);
  const child = new Object2d();
  child.position.set(0, 2);
  parent.add(child);
  parent.updateWorldMatrix();
  const e = child.worldMatrix.elements;
  assert.deepEqual([e[8], e[9]], [1, 2]);
});

test('dispose() destroys per-object GPU buffers and forgets them', () => {
  const object = new Object3d();
  let destroyed = 0;
  object._gpu = {
    uniformBuffer: { destroy: () => destroyed++ },
    instanceBuffer: { destroy: () => destroyed++ },
  };
  object.dispose();
  assert.equal(destroyed, 2);
  assert.equal(object._gpu, null);
});

test('BoxGeometry has 24 vertices, 36 indices and exact bounds', () => {
  const box = new BoxGeometry(2, 4, 6);
  assert.equal(box.vertexCount, 24);
  assert.equal(box.indexCount, 36);
  assert.deepEqual(box.bounds.min, [-1, -2, -3]);
  assert.deepEqual(box.bounds.max, [1, 2, 3]);
});

test('BoxGeometry face normals are unit-length and axis-aligned', () => {
  const box = new BoxGeometry(2, 3, 4);
  for (let i = 0; i < box.vertices.length; i += VERTEX_SIZE) {
    const normal = [
      box.vertices[i + 3],
      box.vertices[i + 4],
      box.vertices[i + 5],
    ];
    const nonZero = normal.filter((c) => c !== 0);
    assert.equal(nonZero.length, 1, `vertex ${i / VERTEX_SIZE}: ${normal}`);
    assert.equal(Math.abs(nonZero[0]), 1);
  }
});

test('Raycaster hits a box through the screen center', () => {
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrices();

  const mesh = new Mesh(new BoxGeometry(2, 2, 2), {});
  mesh.updateWorldMatrix();

  const hits = new Raycaster()
    .setFromCamera(0, 0, camera)
    .intersectObjects([mesh]);
  assert.equal(hits.length, 1);
  assertClose(hits[0].point.z, 1, 'hit point:'); // the near face of the box
  // The ray starts on the near plane (z = 4.9), so the distance is 3.9.
  assertClose(hits[0].distance, 3.9, 'distance:');
});

test('Raycaster misses past the edge of the screen-centered box', () => {
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrices();

  const mesh = new Mesh(new BoxGeometry(2, 2, 2), {});
  mesh.updateWorldMatrix();

  const hits = new Raycaster()
    .setFromCamera(0.9, 0.9, camera)
    .intersectObjects([mesh]);
  assert.equal(hits.length, 0);
});

test('CircleGeometry.containsPoint is exact, not a bounding-box test', () => {
  const circle = new CircleGeometry(0.5, 16);
  assert.equal(circle.containsPoint(0.4, 0), true);
  // Inside the bounding box, outside the circle.
  assert.equal(circle.containsPoint(0.45, 0.45), false);
});

test('RectGeometry.containsPoint tests the bounds', () => {
  const rect = new RectGeometry(2, 1);
  assert.equal(rect.containsPoint(0.9, 0.4), true);
  assert.equal(rect.containsPoint(1.1, 0), false);
});
