import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/math/Vec3.js';
import { Mat4 } from '../src/math/Mat4.js';
import { Object3d } from '../src/3d/core/Object3d.js';
import { Mesh } from '../src/3d/core/Mesh.js';
import { InstancedMesh } from '../src/3d/core/InstancedMesh.js';
import { Raycaster } from '../src/3d/core/Raycaster.js';
import { Geometry } from '../src/3d/geometries/Geometry.js';
import { BoxGeometry } from '../src/3d/geometries/BoxGeometry.js';
import { BasicMaterial } from '../src/3d/materials/BasicMaterial.js';

const EPSILON = 1e-5;
const UINT32_RESTART_INDEX = 0xffffffff;

function assertClose(actual, expected, message = '') {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `${message} expected ${expected}, got ${actual}`,
  );
}

function assertVec3Close(actual, expected, message = '') {
  assertClose(actual.x, expected.x, `${message} x:`);
  assertClose(actual.y, expected.y, `${message} y:`);
  assertClose(actual.z, expected.z, `${message} z:`);
}

function geometryFromPositions(positions, indices) {
  const vertices = [];
  for (const [x, y, z] of positions) {
    vertices.push(x, y, z, 0, 0, 1, 0, 0);
  }
  return new Geometry(vertices, indices);
}

function triangleGeometry(indices = [0, 1, 2]) {
  return geometryFromPositions(
    [
      [-1, -1, 0],
      [1, -1, 0],
      [0, 1, 0],
    ],
    indices,
  );
}

function meshWithTopology(geometry, topology = 'triangle-list') {
  const mesh = new Mesh(geometry, new BasicMaterial({ topology }));
  mesh.updateWorldMatrix();
  return mesh;
}

test('Raycaster narrows indexed triangle-list bounds to exact double-sided faces', () => {
  // Vertex zero is deliberately unused: picking must follow the index buffer,
  // not consume position records as sequential triangles.
  const geometry = geometryFromPositions(
    [
      [0, -4, 0],
      [-1, -1, 0],
      [1, -1, 0],
      [0, 1, 0],
    ],
    [1, 2, 3],
  );
  const mesh = meshWithTopology(geometry);

  // This ray crosses the local AABB but lies outside the indexed triangle.
  const falsePositive = new Raycaster()
    .set(new Vec3(0.9, 0.9, 5), new Vec3(0, 0, -1))
    .intersectObjects([mesh]);
  assert.deepEqual(falsePositive, []);

  const [frontHit] = new Raycaster()
    .set(new Vec3(0, 0, 5), new Vec3(0, 0, -1))
    .intersectObjects([mesh]);
  const [backHit] = new Raycaster()
    .set(new Vec3(0, 0, -5), new Vec3(0, 0, 1))
    .intersectObjects([mesh]);

  assert.ok(frontHit);
  assert.ok(backHit, 'picking remains double-sided despite back-face rendering');
  assert.equal(frontHit.object, mesh);
  assert.equal(backHit.object, mesh);
  assertVec3Close(frontHit.point, new Vec3(0, 0, 0), 'front point');
  assertVec3Close(backHit.point, new Vec3(0, 0, 0), 'back point');
  assertClose(frontHit.distance, 5, 'front distance:');
  assertClose(backHit.distance, 5, 'back distance:');
});

test('Raycaster keeps world distance and maxDistance under parented non-uniform transforms', () => {
  const parent = new Object3d();
  parent.position.set(2, -1, -3);
  parent.rotation.set(0.2, -0.35, 0.15);
  parent.scale.set(-1.5, 0.75, 2);

  const mesh = new Mesh(triangleGeometry(), new BasicMaterial());
  mesh.position.set(0.5, -0.25, 0.75);
  mesh.rotation.set(-0.4, 0.3, -0.2);
  mesh.scale.set(0.5, 2, 0.8);
  parent.add(mesh);
  parent.updateWorldMatrix();

  const worldPoint = new Vec3(0, 0, 0).applyMat4(mesh.worldMatrix);
  const worldOrigin = new Vec3(0, 0, 3).applyMat4(mesh.worldMatrix);
  const direction = worldPoint.clone().sub(worldOrigin);
  const expectedDistance = direction.length();
  const scaledDirection = direction.clone().multiplyScalar(7.25);

  const tooShort = new Raycaster()
    .set(worldOrigin, scaledDirection, expectedDistance - 1e-4)
    .intersectObjects([mesh]);
  assert.deepEqual(tooShort, []);

  const [hit] = new Raycaster()
    .set(worldOrigin, scaledDirection, expectedDistance + 1e-4)
    .intersectObjects([mesh]);
  assert.ok(hit);
  assertVec3Close(hit.point, worldPoint, 'transformed point');
  assertClose(hit.distance, expectedDistance, 'world distance:');
});

test('Raycaster follows triangle-strip indexing across uint32 restarts', () => {
  const geometry = geometryFromPositions(
    [
      [-4, -1, 0],
      [-2, -1, 0],
      [-3, 1, 0],
      [-1, -1, -2],
      [1, -1, -2],
      [-1, 1, -2],
      [1, 1, -2],
    ],
    [0, 1, 2, UINT32_RESTART_INDEX, 3, 4, 5, 6],
  );
  const mesh = meshWithTopology(geometry, 'triangle-strip');

  // The target belongs only to the second triangle after the restart.
  const [hit] = new Raycaster()
    .set(new Vec3(0.5, 0.5, 5), new Vec3(0, 0, -3))
    .intersectObjects([mesh]);

  assert.ok(hit);
  assertVec3Close(hit.point, new Vec3(0.5, 0.5, -2), 'strip point');
  assertClose(hit.distance, 7, 'strip distance:');
});

test('Raycaster does not treat line and point topologies as filled triangles', () => {
  for (const topology of ['line-list', 'line-strip', 'point-list']) {
    const mesh = meshWithTopology(triangleGeometry(), topology);
    const hits = new Raycaster()
      .set(new Vec3(0, 0, 5), new Vec3(0, 0, -1))
      .intersectObjects([mesh]);
    assert.deepEqual(hits, [], `${topology} should not produce a surface hit`);
  }
});

test('Raycaster includes edges but skips behind, degenerate and invalid triangles', () => {
  const valid = meshWithTopology(triangleGeometry());
  const [edgeHit] = new Raycaster()
    .set(new Vec3(0, -1, 2), new Vec3(0, 0, -1))
    .intersectObjects([valid]);
  assert.ok(edgeHit, 'triangle edges are part of the surface');

  const behindAndForward = meshWithTopology(
    geometryFromPositions(
      [
        [-1, -1, -5e-8],
        [1, -1, -5e-8],
        [0, 1, -5e-8],
        [-1, -1, 1],
        [1, -1, 1],
        [0, 1, 1],
      ],
      [0, 1, 2, 3, 4, 5],
    ),
  );
  const [forwardHit] = new Raycaster()
    .set(new Vec3(), new Vec3(0, 0, 1), 2)
    .intersectObjects([behindAndForward]);
  assertClose(forwardHit.distance, 1, 'behind triangle is rejected:');

  const malformed = meshWithTopology(
    triangleGeometry([0, 0, 0, 0, 1, 99]),
  );
  const malformedHits = new Raycaster()
    .set(new Vec3(0, 0, 2), new Vec3(0, 0, -1))
    .intersectObjects([malformed]);
  assert.deepEqual(malformedHits, []);
});

test('Raycaster visits a mesh once when object roots overlap', () => {
  const parent = new Object3d();
  const mesh = new Mesh(triangleGeometry(), new BasicMaterial());
  parent.add(mesh);
  parent.updateWorldMatrix();

  const hits = new Raycaster()
    .set(new Vec3(0, 0, 2), new Vec3(0, 0, -1))
    .intersectObjects([parent, mesh, parent]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].object, mesh);
});

test('a ray starting inside a closed mesh returns its nearest exit triangle', () => {
  const mesh = meshWithTopology(new BoxGeometry(2, 2, 2));
  const raycaster = new Raycaster();

  const [hit] = raycaster
    .set(new Vec3(0, 0, 0), new Vec3(0, 0, -10), 1)
    .intersectObjects([mesh]);
  assert.ok(hit);
  assertVec3Close(hit.point, new Vec3(0, 0, -1), 'exit point');
  assertClose(hit.distance, 1, 'exit distance:');

  const clipped = raycaster
    .set(new Vec3(0, 0, 0), new Vec3(0, 0, -10), 0.99)
    .intersectObjects([mesh]);
  assert.deepEqual(clipped, []);
});

test('InstancedMesh picking uses model * instance transforms and globally sorts one hit per instance', () => {
  // Duplicate faces ensure one instance still contributes only its nearest hit.
  const geometry = triangleGeometry([0, 1, 2, 0, 1, 2]);
  const material = new BasicMaterial();
  const parent = new Object3d();
  parent.position.set(0, 0, -3);
  parent.rotation.z = 0.25;
  parent.scale.set(1.5, 0.75, 0.5);

  const instances = new InstancedMesh(geometry, material, 7);
  instances.position.set(0, 0, -2);
  instances.rotation.z = -0.4;
  instances.scale.set(1, 2, 1);
  parent.add(instances);

  instances.setMatrixAt(0, new Mat4().makeTranslation(0, 0, 0));
  instances.setMatrixAt(1, new Mat4().makeTranslation(0, 0, 8));
  instances.setMatrixAt(2, new Mat4().makeTranslation(5, 0, 8));

  const singular = new Mat4()
    .makeTranslation(0, 0, 12)
    .multiply(new Mat4().makeScale(0, 1, 1));
  instances.setMatrixAt(3, singular);

  const malformed = new Mat4().makeTranslation(0, 0, 16);
  malformed.elements[0] = Number.NaN;
  instances.setMatrixAt(4, malformed);
  instances.setMatrixAt(5, new Mat4().makeTranslation(0, 0, -4));
  const projective = new Mat4().makeTranslation(0, 0, 20);
  projective.elements[3] = 5e-8;
  instances.setMatrixAt(6, projective);

  const regular = new Mesh(geometry, material);
  regular.position.z = 2;
  parent.add(regular);
  parent.updateWorldMatrix();

  const hits = new Raycaster()
    .set(new Vec3(0, 0, 10), new Vec3(0, 0, -4))
    .intersectObjects([parent]);

  assert.equal(hits.length, 4);
  assert.deepEqual(
    hits.map(({ object, instanceId }) => [object, instanceId]),
    [
      [instances, 1],
      [regular, undefined],
      [instances, 0],
      [instances, 5],
    ],
  );
  [10, 12, 14, 16].forEach((distance, index) => {
    assertClose(hits[index].distance, distance, `hit ${index} distance:`);
  });
});
