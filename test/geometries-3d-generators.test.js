import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/math/Vec3.js';
import { intersectIndexedGeometry } from '../src/3d/core/RayIntersection.js';
import { BoxGeometry } from '../src/3d/geometries/BoxGeometry.js';
import { EdgesGeometry } from '../src/3d/geometries/EdgesGeometry.js';
import { ExtrudeGeometry } from '../src/3d/geometries/ExtrudeGeometry.js';
import {
  Geometry,
  VERTEX_SIZE,
} from '../src/3d/geometries/Geometry.js';
import { LatheGeometry } from '../src/3d/geometries/LatheGeometry.js';
import { PlaneGeometry } from '../src/3d/geometries/PlaneGeometry.js';
import { TubeGeometry } from '../src/3d/geometries/TubeGeometry.js';

const EPSILON = 1e-6;

function assertClose(actual, expected, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${label} expected ${expected}, received ${actual}`,
  );
}

function assertVectorClose(actual, expected, label = '') {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let i = 0; i < expected.length; i++) {
    assertClose(actual[i], expected[i], `${label}[${i}]`);
  }
}

function assertBoundsClose(geometry, min, max) {
  assertVectorClose(geometry.bounds.min, min, 'bounds.min');
  assertVectorClose(geometry.bounds.max, max, 'bounds.max');
}

function assertInterleavedGeometry(geometry) {
  assert.ok(geometry instanceof Geometry);
  assert.ok(geometry.vertices instanceof Float32Array);
  assert.ok(geometry.indices instanceof Uint32Array);
  assert.equal(geometry.vertices.length % VERTEX_SIZE, 0);

  for (let offset = 0; offset < geometry.vertices.length; offset += VERTEX_SIZE) {
    for (let component = 0; component < VERTEX_SIZE; component++) {
      assert.equal(
        Number.isFinite(geometry.vertices[offset + component]),
        true,
        `vertex ${offset / VERTEX_SIZE} component ${component}`,
      );
    }
    const normalLength = Math.hypot(
      geometry.vertices[offset + 3],
      geometry.vertices[offset + 4],
      geometry.vertices[offset + 5],
    );
    assertClose(normalLength, 1, `vertex ${offset / VERTEX_SIZE} normal`);
    assert.ok(geometry.vertices[offset + 6] >= 0);
    assert.ok(geometry.vertices[offset + 6] <= 1);
    assert.ok(geometry.vertices[offset + 7] >= 0);
    assert.ok(geometry.vertices[offset + 7] <= 1);
  }

  for (const index of geometry.indices) {
    assert.ok(index < geometry.vertexCount, `index ${index} is in bounds`);
  }
}

function assertOutwardTriangles(geometry) {
  assertInterleavedGeometry(geometry);
  assert.equal(geometry.indices.length % 3, 0);
  const { vertices, indices } = geometry;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * VERTEX_SIZE;
    const b = indices[i + 1] * VERTEX_SIZE;
    const c = indices[i + 2] * VERTEX_SIZE;
    const abx = vertices[b] - vertices[a];
    const aby = vertices[b + 1] - vertices[a + 1];
    const abz = vertices[b + 2] - vertices[a + 2];
    const acx = vertices[c] - vertices[a];
    const acy = vertices[c + 1] - vertices[a + 1];
    const acz = vertices[c + 2] - vertices[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const area = Math.hypot(nx, ny, nz);
    assert.ok(area > 1e-8, `triangle ${i / 3} has area`);

    const vertexNormalX =
      vertices[a + 3] + vertices[b + 3] + vertices[c + 3];
    const vertexNormalY =
      vertices[a + 4] + vertices[b + 4] + vertices[c + 4];
    const vertexNormalZ =
      vertices[a + 5] + vertices[b + 5] + vertices[c + 5];
    assert.ok(
      nx * vertexNormalX + ny * vertexNormalY + nz * vertexNormalZ > 0,
      `triangle ${i / 3} follows its outward normals`,
    );
  }
}

test('EdgesGeometry welds seams and removes coplanar diagonals', () => {
  const plane = new EdgesGeometry(new PlaneGeometry());
  assertInterleavedGeometry(plane);
  assert.equal(plane.vertexCount, 4);
  assert.equal(plane.indexCount, 8, 'four boundary edges and no diagonal');

  const box = new EdgesGeometry(new BoxGeometry());
  assertInterleavedGeometry(box);
  assert.equal(box.vertexCount, 8, '24 face vertices weld to 8 corners');
  assert.equal(box.indexCount, 24, '12 physical box edges');
  assertBoundsClose(box, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]);

  const softened = new EdgesGeometry(new BoxGeometry(), 100);
  assert.equal(softened.indexCount, 0, '90 degree creases are below threshold');

  const highAspectPlane = new EdgesGeometry(new PlaneGeometry(1e8, 1));
  assert.equal(highAspectPlane.vertexCount, 4);
  assert.equal(highAspectPlane.indexCount, 8);
});

test('EdgesGeometry validates its triangle source and threshold', () => {
  assert.throws(() => new EdgesGeometry(null), /source must provide/);
  assert.throws(
    () => new EdgesGeometry(new PlaneGeometry(), -1),
    /between 0 and 180/,
  );
  assert.throws(
    () =>
      new EdgesGeometry(
        new Geometry([0, 0, 0, 0, 0, 1, 0, 0], [0, 1, 2]),
      ),
    /outside the vertex array/,
  );
});

test('LatheGeometry revolves full and signed partial profiles around Y', () => {
  const cylinder = new LatheGeometry([[1, -1], [1, 1]], 4);
  assert.equal(cylinder.vertexCount, 10);
  assert.equal(cylinder.indexCount, 24);
  assertBoundsClose(cylinder, [-1, -1, -1], [1, 1, 1]);
  assertOutwardTriangles(cylinder);

  const partial = new LatheGeometry(
    [{ radius: 1, y: -1 }, { x: 1, y: 1 }],
    3,
    { startAngle: 0, sweepAngle: Math.PI / 2 },
  );
  assert.equal(partial.vertexCount, 8);
  assert.equal(partial.indexCount, 18);
  assertBoundsClose(partial, [0, -1, 0], [1, 1, 1]);
  assertOutwardTriangles(partial);

  const clockwise = new LatheGeometry([[1, -1], [1, 1]], 4, {
    sweepAngle: -Math.PI,
  });
  assertOutwardTriangles(clockwise);

  const largeStart = new LatheGeometry([[1, -1], [1, 1]], 4, {
    startAngle: 1e20,
    sweepAngle: Math.PI,
  });
  assertOutwardTriangles(largeStart);

  const representableTinySweep = new LatheGeometry(
    [[1, -1], [1, 1]],
    4,
    { sweepAngle: 1e-9 },
  );
  assert.equal(representableTinySweep.indexCount, 24);
});

test('LatheGeometry makes non-degenerate poles and validates its profile', () => {
  const pointed = new LatheGeometry([[0, -1], [1, 0], [0, 1]], 4);
  assert.equal(pointed.indexCount, 24);
  assertOutwardTriangles(pointed);

  assert.throws(() => new LatheGeometry([[1, 0]], 8), /at least two/);
  assert.throws(
    () => new LatheGeometry([[-1, 0], [1, 1]], 8),
    /non-negative/,
  );
  assert.throws(
    () => new LatheGeometry([[1, 0], [1, 1]], 2),
    /at least 3/,
  );
  assert.throws(
    () =>
      new LatheGeometry([[1, 0], [1, 1]], 8, { sweepAngle: 0 }),
    /magnitude/,
  );
});

test('LatheGeometry ignores axis-only profile segments when smoothing pole normals', () => {
  const lathe = new LatheGeometry(
    [[0, -1], [0, 0], [1, 0], [1, 1]],
    4,
  );
  const profileSize = 4;
  for (let radial = 0; radial <= 4; radial++) {
    const pole = (radial * profileSize + 1) * VERTEX_SIZE;
    assertVectorClose(
      Array.from(lathe.vertices.slice(pole + 3, pole + 6)),
      [0, -1, 0],
      `pole normal ${radial}`,
    );
  }
  assertOutwardTriangles(lathe);
});

test('TubeGeometry transports stable frames and builds optional caps', () => {
  const straight = new TubeGeometry([[0, 0, 0], [2, 0, 0]], 1, 4);
  assert.equal(straight.vertexCount, 20);
  assert.equal(straight.indexCount, 48);
  assertBoundsClose(straight, [0, -1, -1], [2, 1, 1]);
  assertOutwardTriangles(straight);

  const bent = new TubeGeometry(
    [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
    0.1,
    8,
    { cap: false },
  );
  assert.equal(bent.vertexCount, 27);
  assert.equal(bent.indexCount, 96);
  assertOutwardTriangles(bent);

  const ringStride = 9;
  for (let ring = 1; ring < 3; ring++) {
    const previous = (ring - 1) * ringStride * VERTEX_SIZE;
    const current = ring * ringStride * VERTEX_SIZE;
    const normalDot =
      bent.vertices[previous + 3] * bent.vertices[current + 3] +
      bent.vertices[previous + 4] * bent.vertices[current + 4] +
      bent.vertices[previous + 5] * bent.vertices[current + 5];
    assert.ok(normalDot > 0, `transported frame ${ring} does not flip`);
  }
});

test('TubeGeometry closes its position, normal, and UV seams', () => {
  const closed = new TubeGeometry(
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    0.1,
    4,
    { closed: true },
  );
  assert.equal(closed.vertexCount, 25);
  assert.equal(closed.indexCount, 96);
  assertOutwardTriangles(closed);

  const lastRing = 4 * 5 * VERTEX_SIZE;
  for (let radial = 0; radial <= 4; radial++) {
    const first = radial * VERTEX_SIZE;
    const last = lastRing + radial * VERTEX_SIZE;
    assertVectorClose(
      Array.from(closed.vertices.slice(first, first + 6)),
      Array.from(closed.vertices.slice(last, last + 6)),
      `closed ring vertex ${radial}`,
    );
  }
  assert.equal(closed.vertices[6], 0);
  assert.equal(closed.vertices[lastRing + 6], 1);
});

test('TubeGeometry rejects ambiguous and degenerate paths', () => {
  assert.throws(
    () => new TubeGeometry([[0, 0, 0], [0, 0, 0]]),
    /non-zero length/,
  );
  assert.throws(
    () => new TubeGeometry([[0, 0, 0], [1, 0, 0], [0, 0, 0]]),
    /reverses direction/,
  );
  assert.throws(
    () =>
      new TubeGeometry(
        [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        0.1,
        8,
        { closed: true, cap: true },
      ),
    /cannot also have end caps/,
  );
});

test('ExtrudeGeometry ear-clips a concave polygon with flat sides', () => {
  const lShape = [[0, 2], [1, 2], [1, 1], [2, 1], [2, 0], [0, 0]];
  const extruded = new ExtrudeGeometry(lShape, 2);
  assert.equal(extruded.vertexCount, 36);
  assert.equal(extruded.indexCount, 60);
  assertBoundsClose(extruded, [0, 0, -1], [2, 2, 1]);
  assertOutwardTriangles(extruded);

  const hit = intersectIndexedGeometry(
    new Vec3(0.5, 1.5, 3),
    new Vec3(0, 0, -1),
    extruded,
    'triangle-list',
    Infinity,
  );
  assertClose(hit, 2, 'ray hits concave cap');
  assert.equal(
    intersectIndexedGeometry(
      new Vec3(1.5, 1.5, 3),
      new Vec3(0, 0, -1),
      extruded,
      'triangle-list',
      Infinity,
    ),
    null,
    'ray misses the cut-out while still crossing the AABB',
  );
});

test('ExtrudeGeometry removes redundant points and rejects invalid polygons', () => {
  const rectangle = new ExtrudeGeometry(
    [[0, 0], [1, 0], [2, 0], [2, 1], [0, 1], [0, 0]],
    1,
  );
  assert.equal(rectangle.vertexCount, 24);
  assert.equal(rectangle.indexCount, 36);
  assertOutwardTriangles(rectangle);

  assert.throws(
    () => new ExtrudeGeometry([[0, 0], [1, 1], [0, 1], [1, 0]]),
    /self-intersect/,
  );
  assert.throws(
    () => new ExtrudeGeometry([[0, 0], [1, 0], [2, 0]]),
    /non-collinear|area/,
  );
  assert.throws(
    () => new ExtrudeGeometry([[0, 0], [1, 0], [0, 1]], 0),
    /positive/,
  );
});

test('ExtrudeGeometry preserves Float32-distinct high-aspect polygons', () => {
  const extruded = new ExtrudeGeometry(
    [[0, 0], [1e8, 0], [1e8, 0.01], [0, 0.01]],
    1,
  );

  assert.equal(extruded.vertexCount, 24);
  assert.equal(extruded.indexCount, 36);
  assertBoundsClose(extruded, [0, 0, -0.5], [1e8, 0.01, 0.5]);
  assertOutwardTriangles(extruded);
  assertClose(
    intersectIndexedGeometry(
      new Vec3(5e7, 0.005, 2),
      new Vec3(0, 0, -1),
      extruded,
      'triangle-list',
      Infinity,
    ),
    1.5,
    'ray hits a high-aspect cap',
  );

  assert.throws(
    () =>
      new ExtrudeGeometry(
        [[1e8, 0], [1e8 + 1, 0], [1e8 + 1, 1], [1e8, 1]],
        1,
      ),
    /must be distinct/,
    'points that collapse to one Float32 position are rejected',
  );
});

test('3D generators reject post-Float32 collapse and overflow', () => {
  assert.throws(
    () =>
      new LatheGeometry([[1, -1], [1, 1]], 4, {
        startAngle: Math.PI / 4,
        sweepAngle: 1.1e-7,
      }),
    /triangle that collapses in Float32/,
  );
  assert.throws(
    () => new TubeGeometry([[0, 0, 0], [1, 0, 0]], 1e-46, 3),
    /triangle that collapses in Float32/,
  );
  assert.throws(
    () => new ExtrudeGeometry([[0, 0], [1, 0], [0, 1]], 1e-46),
    /triangle that collapses in Float32/,
  );
  assert.throws(
    () => new ExtrudeGeometry([[0, 0], [1, 0], [0, 1]], 1e40),
    /vertex data outside the Float32 range/,
  );
});
