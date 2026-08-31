import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapsuleGeometry } from '../src/3d/geometries/CapsuleGeometry.js';
import { ConeGeometry } from '../src/3d/geometries/ConeGeometry.js';
import { CylinderGeometry } from '../src/3d/geometries/CylinderGeometry.js';
import { DiskGeometry } from '../src/3d/geometries/DiskGeometry.js';
import {
  Geometry,
  VERTEX_SIZE,
} from '../src/3d/geometries/Geometry.js';
import { PlaneGeometry } from '../src/3d/geometries/PlaneGeometry.js';
import { RingGeometry } from '../src/3d/geometries/RingGeometry.js';
import { TorusGeometry } from '../src/3d/geometries/TorusGeometry.js';

function assertNear(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function assertBounds(geometry, min, max) {
  for (let axis = 0; axis < 3; axis++) {
    assertNear(geometry.bounds.min[axis], min[axis], `min axis ${axis}`);
    assertNear(geometry.bounds.max[axis], max[axis], `max axis ${axis}`);
  }
}

function assertValidTriangleGeometry(geometry) {
  assert.equal(geometry instanceof Geometry, true);
  assert.equal(geometry.vertices instanceof Float32Array, true);
  assert.equal(geometry.indices instanceof Uint32Array, true);
  assert.equal(geometry.vertices.length % VERTEX_SIZE, 0);
  assert.equal(geometry.indices.length % 3, 0);

  for (const index of geometry.indices) {
    assert.ok(index < geometry.vertexCount, `index ${index} is in range`);
  }

  for (let offset = 0; offset < geometry.vertices.length; offset += VERTEX_SIZE) {
    const normalLength = Math.hypot(
      geometry.vertices[offset + 3],
      geometry.vertices[offset + 4],
      geometry.vertices[offset + 5],
    );
    assertNear(normalLength, 1, `vertex ${offset / VERTEX_SIZE} normal`);
    const u = geometry.vertices[offset + 6];
    const v = geometry.vertices[offset + 7];
    assert.ok(Number.isFinite(u) && u >= 0 && u <= 1, `u ${u}`);
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `v ${v}`);
  }

  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const a = geometry.indices[offset] * VERTEX_SIZE;
    const b = geometry.indices[offset + 1] * VERTEX_SIZE;
    const c = geometry.indices[offset + 2] * VERTEX_SIZE;
    const abx = geometry.vertices[b] - geometry.vertices[a];
    const aby = geometry.vertices[b + 1] - geometry.vertices[a + 1];
    const abz = geometry.vertices[b + 2] - geometry.vertices[a + 2];
    const acx = geometry.vertices[c] - geometry.vertices[a];
    const acy = geometry.vertices[c + 1] - geometry.vertices[a + 1];
    const acz = geometry.vertices[c + 2] - geometry.vertices[a + 2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const area = Math.hypot(crossX, crossY, crossZ);
    assert.ok(area > 1e-8, `triangle ${offset / 3} has positive area`);

    const normalX =
      geometry.vertices[a + 3] +
      geometry.vertices[b + 3] +
      geometry.vertices[c + 3];
    const normalY =
      geometry.vertices[a + 4] +
      geometry.vertices[b + 4] +
      geometry.vertices[c + 4];
    const normalZ =
      geometry.vertices[a + 5] +
      geometry.vertices[b + 5] +
      geometry.vertices[c + 5];
    assert.ok(
      crossX * normalX + crossY * normalY + crossZ * normalZ > 0,
      `triangle ${offset / 3} has CCW outward winding`,
    );
  }
}

test('PlaneGeometry preserves its default quad and supports subdivisions', () => {
  const defaultPlane = new PlaneGeometry();
  const plane = new PlaneGeometry(4, 6, 2, 3);

  assert.equal(defaultPlane.vertexCount, 4);
  assert.equal(defaultPlane.indexCount, 6);
  assert.deepEqual(
    Array.from(defaultPlane.indices),
    [0, 1, 2, 0, 2, 3],
  );
  assert.deepEqual(
    Array.from(defaultPlane.vertices),
    [
      -0.5, 0, 0.5, 0, 1, 0, 0, 0,
      0.5, 0, 0.5, 0, 1, 0, 1, 0,
      0.5, 0, -0.5, 0, 1, 0, 1, 1,
      -0.5, 0, -0.5, 0, 1, 0, 0, 1,
    ],
  );
  assert.equal(plane.vertexCount, 12);
  assert.equal(plane.indexCount, 36);
  assertBounds(plane, [-2, 0, -3], [2, 0, 3]);
  assertValidTriangleGeometry(plane);
});

test('CylinderGeometry builds a closed segmented Y-axis frustum', () => {
  const cylinder = new CylinderGeometry(2, 1, 4, 4, 2);

  assert.equal(cylinder.vertexCount, 27);
  assert.equal(cylinder.indexCount, 72);
  assertBounds(cylinder, [-2, -2, -2], [2, 2, 2]);
  assertValidTriangleGeometry(cylinder);

  const open = new CylinderGeometry(2, 1, 4, 4, 2, true);
  assert.equal(open.vertexCount, 15);
  assert.equal(open.indexCount, 48);
  assertValidTriangleGeometry(open);
});

test('ConeGeometry is a pointed-top CylinderGeometry without degenerate triangles', () => {
  const cone = new ConeGeometry(1, 2, 4);

  assert.equal(cone instanceof CylinderGeometry, true);
  assert.equal(cone.vertexCount, 16);
  assert.equal(cone.indexCount, 24);
  assertBounds(cone, [-1, -1, -1], [1, 1, 1]);
  assertValidTriangleGeometry(cone);
});

test('DiskGeometry builds an open partial sector facing +Y', () => {
  const disk = new DiskGeometry(1, 4, 0, Math.PI);

  assert.equal(disk.vertexCount, 6);
  assert.equal(disk.indexCount, 12);
  assertBounds(disk, [-1, 0, 0], [1, 0, 1]);
  assertValidTriangleGeometry(disk);

  assertValidTriangleGeometry(new DiskGeometry(1, 4, 1e20, Math.PI));
  assertValidTriangleGeometry(new DiskGeometry(1, 4, 0, -Math.PI));
});

test('RingGeometry builds a radially segmented partial annulus', () => {
  const ring = new RingGeometry(0.5, 1, 4, 2, 0, Math.PI);

  assert.equal(ring.vertexCount, 15);
  assert.equal(ring.indexCount, 48);
  assertBounds(ring, [-1, 0, 0], [1, 0, 1]);
  assertValidTriangleGeometry(ring);

  const diskLikeRing = new RingGeometry(0, 1, 4);
  assert.equal(diskLikeRing.indexCount, 12);
  assertValidTriangleGeometry(diskLikeRing);
  assertValidTriangleGeometry(
    new RingGeometry(0.5, 1, 4, 1, 1e20, Math.PI),
  );
  assertValidTriangleGeometry(
    new RingGeometry(0.5, 1, 4, 1, 0, -Math.PI),
  );
});

test('TorusGeometry builds a Y-axis torus with an open partial major arc', () => {
  const torus = new TorusGeometry(2, 0.5, 4, 8, Math.PI);

  assert.equal(torus.vertexCount, 45);
  assert.equal(torus.indexCount, 192);
  assertBounds(torus, [-2.5, -0.5, 0], [2.5, 0.5, 2.5]);
  assertValidTriangleGeometry(torus);
  assertValidTriangleGeometry(new TorusGeometry(2, 0.5, 4, 8, -Math.PI));
});

test('CapsuleGeometry length measures the straight body between hemispheres', () => {
  const capsule = new CapsuleGeometry(1, 2, 2, 8);

  assert.equal(capsule.vertexCount, 54);
  assert.equal(capsule.indexCount, 192);
  assertBounds(capsule, [-1, -2, -1], [1, 2, 1]);
  assertValidTriangleGeometry(capsule);

  const sphere = new CapsuleGeometry(1, 0, 2, 8);
  assert.equal(sphere.vertexCount, 45);
  assert.equal(sphere.indexCount, 144);
  assertBounds(sphere, [-1, -1, -1], [1, 1, 1]);
  assertValidTriangleGeometry(sphere);
});

test('3D primitive constructors reject invalid dimensions and segments', () => {
  assert.throws(() => new PlaneGeometry(0), /width must be a positive/);
  assert.throws(() => new PlaneGeometry(1, 1, 1.5), /widthSegments/);
  assert.throws(() => new CylinderGeometry(0, 0), /cannot both be zero/);
  assert.throws(() => new CylinderGeometry(1, 1, 0), /height/);
  assert.throws(() => new CylinderGeometry(1, 1, 1, 2), /radialSegments/);
  assert.throws(
    () => new CylinderGeometry(1, 1, 1, 3, 1, 1),
    /openEnded must be a boolean/,
  );
  assert.throws(() => new ConeGeometry(0), /cannot both be zero/);
  assert.throws(() => new DiskGeometry(0), /radius must be a positive/);
  assert.throws(
    () => new DiskGeometry(1, 32, Infinity),
    /thetaStart must be a finite/,
  );
  assert.throws(() => new DiskGeometry(1, 32, 0, 0), /thetaLength/);
  assert.throws(() => new RingGeometry(1, 1), /innerRadius/);
  assert.throws(() => new RingGeometry(-1, 1), /innerRadius/);
  assert.throws(() => new TorusGeometry(1, 1), /tube must be less/);
  assert.throws(() => new TorusGeometry(1, 0.25, 2), /radialSegments/);
  assert.throws(
    () => new TorusGeometry(1, 0.25, 3, 3, Math.PI * 3),
    /arc/,
  );
  assert.throws(() => new CapsuleGeometry(0), /radius must be a positive/);
  assert.throws(() => new CapsuleGeometry(1, -1), /length/);
  assert.throws(() => new CapsuleGeometry(1, 1, 0), /capSegments/);
});

test('3D primitives reject data that collapses during Float32 conversion', () => {
  assert.throws(
    () => new PlaneGeometry(1e-46, 1),
    /triangle that collapses in Float32/,
  );
  assert.throws(
    () => new PlaneGeometry(1e40, 1),
    /vertex data outside the Float32 range/,
  );
  assert.throws(
    () => new CylinderGeometry(1, 1, 1e-46, 3),
    /triangle that collapses in Float32/,
  );
  assert.throws(
    () => new DiskGeometry(1, 3, Math.PI / 4, 1e-8),
    /triangle that collapses in Float32/,
  );
  assert.throws(
    () => new RingGeometry(1, 1 + 1e-8, 4),
    /triangle that collapses in Float32/,
  );
  assert.throws(
    () => new TorusGeometry(1, 1e-46, 3, 3),
    /triangle that collapses in Float32/,
  );
  assert.throws(
    () => new CapsuleGeometry(1e-46, 1, 1, 3),
    /triangle that collapses in Float32/,
  );
});
