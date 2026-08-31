import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArcOutlineGeometry } from '../src/2d/geometries/ArcOutlineGeometry.js';
import { Geometry2d } from '../src/2d/geometries/Geometry2d.js';
import { PolylineGeometry2d } from '../src/2d/geometries/PolylineGeometry2d.js';
import { RingGeometry2d } from '../src/2d/geometries/RingGeometry2d.js';
import { RoundedRectGeometry } from '../src/2d/geometries/RoundedRectGeometry.js';
import { Vec2 } from '../src/math/Vec2.js';

const VERTEX_SIZE = 4;

function assertUvRange(geometry) {
  for (let i = 0; i < geometry.vertices.length; i += VERTEX_SIZE) {
    const u = geometry.vertices[i + 2];
    const v = geometry.vertices[i + 3];
    assert.equal(Number.isFinite(u), true, `vertex ${i / VERTEX_SIZE} u`);
    assert.equal(Number.isFinite(v), true, `vertex ${i / VERTEX_SIZE} v`);
    assert.ok(u >= 0 && u <= 1, `vertex ${i / VERTEX_SIZE} u: ${u}`);
    assert.ok(v >= 0 && v <= 1, `vertex ${i / VERTEX_SIZE} v: ${v}`);
  }
}

function assertCcwTriangles(geometry, minimumArea = 1e-8) {
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const a = geometry.indices[i] * VERTEX_SIZE;
    const b = geometry.indices[i + 1] * VERTEX_SIZE;
    const c = geometry.indices[i + 2] * VERTEX_SIZE;
    const area =
      (geometry.vertices[b] - geometry.vertices[a]) *
        (geometry.vertices[c + 1] - geometry.vertices[a + 1]) -
      (geometry.vertices[b + 1] - geometry.vertices[a + 1]) *
        (geometry.vertices[c] - geometry.vertices[a]);
    assert.ok(
      area > minimumArea,
      `triangle ${i / 3} winding/area: ${area}`,
    );
  }
}

test('ArcOutlineGeometry builds an open signed line-list arc', () => {
  const arc = new ArcOutlineGeometry(2, 0, Math.PI / 2, 2, {
    hitTolerance: 0.02,
  });

  assert.equal(arc instanceof Geometry2d, true);
  assert.equal(arc.vertexCount, 3);
  assert.equal(arc.indexCount, 4);
  assert.deepEqual(Array.from(arc.indices), [0, 1, 1, 2]);
  assert.ok(Math.abs(arc.vertices[0] - 2) < 1e-6);
  assert.ok(Math.abs(arc.vertices[1]) < 1e-6);
  assert.ok(Math.abs(arc.vertices[8]) < 1e-6);
  assert.ok(Math.abs(arc.vertices[9] - 2) < 1e-6);
  assertUvRange(arc);

  const edgeMidpointX = (arc.vertices[0] + arc.vertices[4]) / 2;
  const edgeMidpointY = (arc.vertices[1] + arc.vertices[5]) / 2;
  assert.equal(arc.containsPoint(edgeMidpointX, edgeMidpointY), true);
  assert.equal(arc.containsPoint(0, 0), false);

  const clockwise = new ArcOutlineGeometry(1, 0, -Math.PI / 2, 1);
  assert.ok(Math.abs(clockwise.vertices[5] + 1) < 1e-6);
  assert.deepEqual(Array.from(clockwise.indices), [0, 1]);
});

test('ArcOutlineGeometry validates dimensions, angles, segments, and picking tolerance', () => {
  assert.equal(new ArcOutlineGeometry(1, 0, 1, 0).segments, 1);
  assert.throws(() => new ArcOutlineGeometry(-1), /radius must be/);
  assert.throws(() => new ArcOutlineGeometry(0), /radius must be/);
  assert.throws(() => new ArcOutlineGeometry(1, Infinity), /startAngle/);
  assert.throws(
    () => new ArcOutlineGeometry(1, 0, Number.NaN),
    /sweepAngle/,
  );
  assert.throws(() => new ArcOutlineGeometry(1, 0, 0), /sweepAngle/);
  assert.throws(
    () => new ArcOutlineGeometry(1, 0, Math.PI * 2 + 0.1),
    /at most 2 PI/,
  );
  assert.throws(() => new ArcOutlineGeometry(1, 0, 1, -1), /segments/);
  assert.throws(
    () => new ArcOutlineGeometry(1, 0, 1, 8, { hitTolerance: -1 }),
    /hitTolerance/,
  );

  const largeStart = new ArcOutlineGeometry(1, 1e20, Math.PI, 4);
  for (let i = 0; i < largeStart.indexCount; i += 2) {
    const a = largeStart.indices[i] * VERTEX_SIZE;
    const b = largeStart.indices[i + 1] * VERTEX_SIZE;
    assert.ok(
      Math.hypot(
        largeStart.vertices[b] - largeStart.vertices[a],
        largeStart.vertices[b + 1] - largeStart.vertices[a + 1],
      ) > 0,
    );
  }
  assert.throws(
    () => new ArcOutlineGeometry(1, 1.2, 1e-7, 32),
    /collapses in Float32/,
  );
});

test('RingGeometry2d builds CCW annular sectors and picks radially and angularly', () => {
  const ring = new RingGeometry2d(0.5, 1, 4, {
    startAngle: 0,
    sweepAngle: Math.PI / 2,
  });

  assert.equal(ring instanceof Geometry2d, true);
  assert.equal(ring.vertexCount, 10);
  assert.equal(ring.indexCount, 24);
  assert.equal(ring.vertices instanceof Float32Array, true);
  assert.equal(ring.indices instanceof Uint32Array, true);
  assertCcwTriangles(ring);
  assertUvRange(ring);
  assert.equal(ring.containsPoint(0.75, 0), true, 'start boundary');
  assert.equal(ring.containsPoint(0.5, 0.5), true, 'inside sector');
  assert.equal(ring.containsPoint(0.25, 0.25), false, 'inside hole');
  assert.equal(ring.containsPoint(-0.75, 0), false, 'outside angle');
  assert.equal(ring.containsPoint(0, 1), true, 'end boundary');
});

test('RingGeometry2d supports clockwise sectors, full rings, and disk sectors', () => {
  const clockwise = new RingGeometry2d(0.25, 1, 4, {
    startAngle: 0,
    sweepAngle: -Math.PI / 2,
  });
  assertCcwTriangles(clockwise);
  assert.equal(clockwise.containsPoint(0.5, -0.5), true);
  assert.equal(clockwise.containsPoint(0.5, 0.5), false);

  const full = new RingGeometry2d(0.5, 1, 8);
  assert.equal(full.containsPoint(-0.75, 0), true);
  assert.equal(full.containsPoint(0, 0), false);

  const sector = new RingGeometry2d(0, 1, 4, {
    sweepAngle: Math.PI / 2,
  });
  assert.equal(sector.vertexCount, 6);
  assert.equal(sector.indexCount, 12);
  assertCcwTriangles(sector);
  assert.equal(sector.containsPoint(0, 0), true);
  assert.equal(sector.containsPoint(0.1, 0.1), true);
});

test('RingGeometry2d validates radii, segment counts, and finite angles', () => {
  assert.equal(new RingGeometry2d(0, 1, 1).segments, 3);
  assert.throws(() => new RingGeometry2d(-1, 1), /innerRadius/);
  assert.throws(() => new RingGeometry2d(0, 0), /outerRadius/);
  assert.throws(() => new RingGeometry2d(2, 1), /less than/);
  assert.throws(() => new RingGeometry2d(1, 1), /less than/);
  assert.throws(() => new RingGeometry2d(0, 1, -1), /segments/);
  assert.throws(
    () => new RingGeometry2d(0, 1, 8, { startAngle: Infinity }),
    /startAngle/,
  );
  assert.throws(
    () => new RingGeometry2d(0, 1, 8, { sweepAngle: Number.NaN }),
    /sweepAngle/,
  );
  assert.throws(
    () => new RingGeometry2d(0, 1, 8, { sweepAngle: 0 }),
    /sweepAngle/,
  );
  assert.throws(
    () => new RingGeometry2d(0, 1, 8, { sweepAngle: Math.PI * 2 + 0.1 }),
    /at most 2 PI/,
  );

  const largeStart = new RingGeometry2d(0.25, 1, 4, {
    startAngle: 1e20,
    sweepAngle: Math.PI,
  });
  assertCcwTriangles(largeStart);
  assert.throws(
    () =>
      new RingGeometry2d(0.5, 1, 32, {
        startAngle: 1.2,
        sweepAngle: 1e-7,
      }),
    /collapses in Float32/,
  );
  assert.throws(
    () => new RingGeometry2d(1e10, 1e10 + 1, 3),
    /collapses in Float32/,
  );
});

test('RoundedRectGeometry tessellates rounded corners with exact bounds and picking', () => {
  const rectangle = new RoundedRectGeometry(4, 2, 0.5, 2);

  assert.equal(rectangle instanceof Geometry2d, true);
  assert.equal(rectangle.vertexCount, 13);
  assert.equal(rectangle.indexCount, 36);
  assert.deepEqual(rectangle.bounds, { min: [-2, -1], max: [2, 1] });
  assertCcwTriangles(rectangle);
  assertUvRange(rectangle);
  assert.equal(rectangle.containsPoint(0, 0), true);
  assert.equal(rectangle.containsPoint(1.75, 0.75), true);
  assert.equal(rectangle.containsPoint(1.95, 0.95), false);
  assert.equal(rectangle.containsPoint(2, 0), true);
  assert.equal(rectangle.containsPoint(2.01, 0), false);
});

test('RoundedRectGeometry clamps its radius and validates inputs', () => {
  const capsule = new RoundedRectGeometry(4, 2, 10, 3);
  assert.equal(capsule.radius, 1);
  assertCcwTriangles(capsule);

  assert.throws(() => new RoundedRectGeometry(-1), /width/);
  assert.throws(() => new RoundedRectGeometry(0), /width/);
  assert.throws(() => new RoundedRectGeometry(1, Infinity), /height/);
  assert.throws(() => new RoundedRectGeometry(1, 0), /height/);
  assert.throws(() => new RoundedRectGeometry(1, 1, -1), /radius/);
  assert.throws(
    () => new RoundedRectGeometry(1, 1, 0.1, Number.NaN),
    /cornerSegments/,
  );
});

test('PolylineGeometry2d creates bevel and miter joins with exact mesh picking', () => {
  const bevel = new PolylineGeometry2d(
    [
      [0, 0],
      [2, 0],
      [2, 2],
    ],
    1,
    { join: 'bevel' },
  );

  assert.equal(bevel instanceof Geometry2d, true);
  assert.equal(bevel.vertexCount, 11);
  assert.equal(bevel.indexCount, 15);
  assert.deepEqual(bevel.bounds, { min: [0, -0.5], max: [2.5, 2] });
  assertCcwTriangles(bevel);
  assertUvRange(bevel);
  assert.equal(bevel.containsPoint(1, 0.4), true);
  assert.equal(bevel.containsPoint(2.2, -0.2), true, 'bevel wedge');
  assert.equal(bevel.containsPoint(2.4, -0.4), false, 'past bevel chord');

  const miter = new PolylineGeometry2d(
    [
      [0, 0],
      [2, 0],
      [2, 2],
    ],
    1,
  );
  assertCcwTriangles(miter);
  assert.equal(miter.containsPoint(2.4, -0.4), true, 'miter corner');
});

test('PolylineGeometry2d supports round and square caps, round joins, and closed paths', () => {
  const round = new PolylineGeometry2d(
    [
      [0, 0],
      [2, 0],
    ],
    1,
    { cap: 'round', roundSegments: 4 },
  );
  assertCcwTriangles(round);
  assertUvRange(round);
  assert.equal(round.containsPoint(-0.4, 0), true);
  assert.equal(round.containsPoint(-0.4, 0.4), false);

  const square = new PolylineGeometry2d([0, 0, 2, 0], 1, {
    cap: 'square',
  });
  assert.deepEqual(square.bounds, { min: [-0.5, -0.5], max: [2.5, 0.5] });
  assert.equal(square.containsPoint(-0.4, 0.4), true);

  const roundedJoin = new PolylineGeometry2d(
    [
      [0, 0],
      [2, 0],
      [2, 2],
    ],
    1,
    { join: 'round', roundSegments: 4 },
  );
  assertCcwTriangles(roundedJoin);
  assert.equal(roundedJoin.containsPoint(2.45, -0.1), true);
  assert.equal(roundedJoin.containsPoint(2.45, -0.45), false);

  const closed = new PolylineGeometry2d(
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 0],
    ],
    0.2,
    { closed: true, cap: 'square' },
  );
  assert.equal(closed.points.length, 3, 'duplicate closing point is removed');
  assertCcwTriangles(closed);
});

test('PolylineGeometry2d accepts Vec2-like points, removes duplicates, and validates its API', () => {
  const line = new PolylineGeometry2d(
    [
      new Vec2(0, 0),
      { x: 0, y: 0 },
      new Vec2(1, 0),
    ],
    0.1,
  );
  assert.equal(line.points.length, 2);
  assert.equal(line.indexCount, 6);
  assert.equal(line.containsPoint(0.5, 0), true);
  assertUvRange(line);

  assert.throws(() => new PolylineGeometry2d([[0, 0]], 1), /at least 2/);
  assert.throws(() => new PolylineGeometry2d([0, 0, 1], 1), /x\/y pairs/);
  assert.throws(
    () => new PolylineGeometry2d([[0, 0], [Infinity, 0]], 1),
    /finite numbers/,
  );
  assert.throws(
    () => new PolylineGeometry2d([[0, 0], [1, 0]], 0),
    /thickness/,
  );
  assert.throws(
    () => new PolylineGeometry2d([[0, 0], [1, 0]], -1),
    /thickness/,
  );
  assert.throws(
    () => new PolylineGeometry2d([[0, 0], [1, 0]], 1, { join: 'none' }),
    /join/,
  );
  assert.throws(
    () => new PolylineGeometry2d([[0, 0], [1, 0]], 1, { cap: 'none' }),
    /cap/,
  );
  assert.throws(
    () =>
      new PolylineGeometry2d([[0, 0], [1, 0]], 1, { miterLimit: 0 }),
    /miterLimit/,
  );
  assert.throws(
    () =>
      new PolylineGeometry2d([[0, 0], [1, 0]], 1, {
        roundSegments: Infinity,
      }),
    /roundSegments/,
  );
});

test('PolylineGeometry2d preserves thin joins and filters Float32-collapsed triangles', () => {
  const thinMiter = new PolylineGeometry2d(
    [[-1, 0], [0, 0], [0, 1]],
    1e-6,
  );
  assert.equal(thinMiter.indexCount, 18);
  assertCcwTriangles(thinMiter, 0);

  const tinyBevel = new PolylineGeometry2d(
    [[0, 0], [1e-6, 0], [1e-6, 1e-6]],
    1e-7,
    { join: 'bevel' },
  );
  assert.equal(tinyBevel.containsPoint(2e-7, 8e-7), false);
  assert.equal(tinyBevel.containsPoint(9.75e-7, 8e-7), true);
  assertCcwTriangles(tinyBevel, 0);

  const nearReversal = new PolylineGeometry2d(
    [[0, 0], [2, 0], [0.001, 0.000001], [0, 1]],
    0.2,
    { join: 'bevel', miterLimit: 1 },
  );
  assert.ok(nearReversal.indexCount < 24);
  assertCcwTriangles(nearReversal, 0);
});
