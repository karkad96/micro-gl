import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArcOutlineGeometry } from '../src/2d/geometries/ArcOutlineGeometry.js';
import { createRationalGeodesicSpecs } from '../examples/rationalGeodesics.js';

const EPSILON = 1e-9;
const FLOAT32_EPSILON = 1e-5;

test('denominator limit 2 creates nine points and four diameters', () => {
  const { points, arcs, diameters, stats } = createRationalGeodesicSpecs(2);

  assert.deepEqual(stats, {
    denominatorLimit: 2,
    coordinateCount: 3,
    pointCount: 9,
    minimumPointCount: 3,
    candidateCircleCount: 24,
    underSupportedCircleCount: 24,
    curvedGeodesicCount: 0,
    diameterGeodesicCount: 4,
    geodesicCount: 4,
    curvedOrderedTripleCount: 0,
    diameterOrderedTripleCount: 24,
    orderedTripleCount: 24,
  });
  assert.equal(arcs.length, 0);
  assert.equal(diameters.length, 4);

  const coordinates = new Set(
    points.flatMap(({ x, y }) => [fractionKey(x), fractionKey(y)]),
  );
  assert.deepEqual(Array.from(coordinates).sort(), ['-1/2', '0/1', '1/2']);
  assert.equal(new Set(points.map(pointKey)).size, 9);
  for (const diameter of diameters) {
    assert.equal(diameter.pointIndices.length, 3);
  }
});

test('denominator limit 3 creates exact multi-point unit-disk geodesics', () => {
  const { points, arcs, diameters, stats } = createRationalGeodesicSpecs(3);

  assert.deepEqual(stats, {
    denominatorLimit: 3,
    coordinateCount: 7,
    pointCount: 49,
    minimumPointCount: 3,
    candidateCircleCount: 952,
    underSupportedCircleCount: 912,
    curvedGeodesicCount: 40,
    diameterGeodesicCount: 16,
    geodesicCount: 56,
    curvedOrderedTripleCount: 384,
    diameterOrderedTripleCount: 912,
    orderedTripleCount: 1296,
  });

  for (const point of points) {
    assertReducedBoundedFraction(point.x, 3);
    assertReducedBoundedFraction(point.y, 3);
    assertPointClose(point.position, [
      fractionValue(point.x),
      fractionValue(point.y),
    ]);
    assert.ok(squaredLength(point.position) < 1);
  }
  assert.equal(new Set(points.map(pointKey)).size, points.length);

  const centerKeys = new Set();
  const arcSupportCounts = new Map();
  for (const spec of arcs) {
    assert.ok(spec.pointIndices.length >= stats.minimumPointCount);
    assert.equal(new Set(spec.pointIndices).size, spec.pointIndices.length);
    incrementCount(arcSupportCounts, spec.pointIndices.length);
    assert.equal(spec.largeArc, false);

    assertClose(squaredLength(spec.center), 1 + spec.radius * spec.radius);
    const centerKey = spec.center
      .map((value) => Math.round(value / EPSILON))
      .join(':');
    assert.equal(centerKeys.has(centerKey), false);
    centerKeys.add(centerKey);

    for (const endpoint of [spec.start, spec.end]) {
      assertClose(Math.hypot(...endpoint), 1);
      assertClose(
        endpoint[0] * (endpoint[0] - spec.center[0]) +
          endpoint[1] * (endpoint[1] - spec.center[1]),
        0,
      );
      assertClose(
        Math.hypot(endpoint[0] - spec.center[0], endpoint[1] - spec.center[1]),
        spec.radius,
      );
    }

    for (const pointIndex of spec.pointIndices) {
      const point = points[pointIndex]?.position;
      assert.ok(point, `invalid rational point index ${pointIndex}`);
      assertClose(
        Math.hypot(point[0] - spec.center[0], point[1] - spec.center[1]),
        spec.radius,
      );
    }

    const geometry = ArcOutlineGeometry.fromPoints({
      center: spec.center,
      start: spec.start,
      end: spec.end,
      largeArc: spec.largeArc,
      segments: 24,
    });
    const endOffset = geometry.vertices.length - 4;
    assertPointClose(
      [geometry.vertices[0], geometry.vertices[1]],
      spec.start,
      FLOAT32_EPSILON,
    );
    assertPointClose(
      [geometry.vertices[endOffset], geometry.vertices[endOffset + 1]],
      spec.end,
      FLOAT32_EPSILON,
    );
    assert.ok(Math.abs(geometry.sweepAngle) < Math.PI);

    for (let offset = 0; offset < geometry.vertices.length; offset += 4) {
      const vertex = [geometry.vertices[offset], geometry.vertices[offset + 1]];
      assert.ok(
        squaredLength(vertex) <= 1 + FLOAT32_EPSILON,
        `arc vertex (${vertex.join(', ')}) escaped the unit disk`,
      );
    }
  }
  assert.deepEqual(Object.fromEntries(arcSupportCounts), { 3: 32, 4: 8 });
  assert.equal(centerKeys.size, arcs.length);

  const directionKeys = new Set();
  const diameterSupportCounts = new Map();
  for (const spec of diameters) {
    assert.ok(spec.pointIndices.length >= stats.minimumPointCount);
    incrementCount(diameterSupportCounts, spec.pointIndices.length);
    assertPointClose(
      spec.start,
      spec.end.map((value) => -value),
    );
    assertClose(Math.hypot(...spec.start), 1);
    assertClose(Math.hypot(...spec.end), 1);

    const directionKey = spec.direction
      .map((value) => Math.round(value / EPSILON))
      .join(':');
    assert.equal(directionKeys.has(directionKey), false);
    directionKeys.add(directionKey);

    for (const pointIndex of spec.pointIndices) {
      const [x, y] = points[pointIndex].position;
      assertClose(x * spec.direction[1] - y * spec.direction[0], 0);
    }
  }
  assert.deepEqual(Object.fromEntries(diameterSupportCounts), { 3: 12, 7: 4 });
  assert.equal(directionKeys.size, diameters.length);

  const knownArc = arcs.find(
    ({ center: [x, y] }) =>
      Math.abs(x - 5 / 3) <= EPSILON && Math.abs(y - 1 / 6) <= EPSILON,
  );
  assert.ok(knownArc);
  const knownSupport = new Set(
    knownArc.pointIndices.map((index) => pointKey(points[index])),
  );
  assert.deepEqual(knownSupport, new Set(['1/3:0/1', '1/3:1/3', '1/2:-1/2']));
});

test('minimumPointCount applies to rational arcs and diameters', () => {
  const { arcs, diameters, stats } = createRationalGeodesicSpecs(3, {
    minimumPointCount: 4,
  });

  assert.equal(arcs.length, 8);
  assert.equal(diameters.length, 4);
  assert.equal(stats.underSupportedCircleCount, 944);
  assert.equal(stats.geodesicCount, 12);
  assert.equal(stats.curvedOrderedTripleCount, 192);
  assert.equal(stats.diameterOrderedTripleCount, 840);
  assert.equal(stats.orderedTripleCount, 1032);
});

test('rational geodesic options reject invalid bounds and point counts', () => {
  assert.throws(() => createRationalGeodesicSpecs(0), /positive/);
  assert.throws(() => createRationalGeodesicSpecs(Infinity), /positive/);
  assert.throws(() => createRationalGeodesicSpecs(2.5), /integer/);
  assert.throws(() => createRationalGeodesicSpecs(9), /must not exceed 8/);
  assert.throws(
    () => createRationalGeodesicSpecs(3, { minimumPointCount: 2 }),
    /greater than or equal to 3/,
  );
  assert.throws(
    () => createRationalGeodesicSpecs(3, { minimumPointCount: 3.5 }),
    /integer/,
  );
});

function assertReducedBoundedFraction(fraction, denominatorLimit) {
  assert.ok(fraction.denominator >= 1);
  assert.ok(fraction.denominator <= denominatorLimit);
  assert.equal(
    greatestCommonDivisor(Math.abs(fraction.numerator), fraction.denominator),
    1,
  );
}

function greatestCommonDivisor(first, second) {
  while (second !== 0) {
    [first, second] = [second, first % second];
  }
  return first;
}

function incrementCount(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function fractionKey({ numerator, denominator }) {
  return `${numerator}/${denominator}`;
}

function fractionValue({ numerator, denominator }) {
  return numerator / denominator;
}

function pointKey({ x, y }) {
  return `${fractionKey(x)}:${fractionKey(y)}`;
}

function squaredLength([x, y]) {
  return x * x + y * y;
}

function assertPointClose(actual, expected, epsilon = EPSILON) {
  assertClose(actual[0], expected[0], epsilon);
  assertClose(actual[1], expected[1], epsilon);
}

function assertClose(actual, expected, epsilon = EPSILON) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}
