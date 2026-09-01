import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kleinToPoincare,
  poincareToKlein,
} from '../examples/hyperbolicModels.js';
import { createRationalGeodesicSpecs } from '../examples/rationalGeodesics.js';

const EPSILON = 1e-9;

test('Poincare and Klein maps are inverse radial disk maps', () => {
  const poincarePoint = [1 / 3, -1 / 2];
  const kleinPoint = poincareToKlein(poincarePoint);

  assertPointClose(kleinPoint, [24 / 49, -36 / 49]);
  assert.ok(Math.hypot(...kleinPoint) > Math.hypot(...poincarePoint));
  assertClose(
    poincarePoint[0] * kleinPoint[1] - poincarePoint[1] * kleinPoint[0],
    0,
  );
  assertPointClose(kleinToPoincare(kleinPoint), poincarePoint);
  assertPointClose(poincareToKlein([0, 0]), [0, 0]);
});

test('the model maps fix every ideal point on the unit boundary', () => {
  for (const angle of [0, Math.PI / 7, Math.PI / 2, Math.PI]) {
    const boundaryPoint = [Math.cos(angle), Math.sin(angle)];
    assertPointClose(poincareToKlein(boundaryPoint), boundaryPoint);
    assertPointClose(kleinToPoincare(boundaryPoint), boundaryPoint);
  }
});

test('mapped rational support points lie on the corresponding Klein chords', () => {
  const { points, arcs, diameters } = createRationalGeodesicSpecs(3);
  const knownMappedSupport = [
    poincareToKlein([1 / 3, 0]),
    poincareToKlein([1 / 3, 1 / 3]),
    poincareToKlein([1 / 2, -1 / 2]),
  ];
  assertPointClose(knownMappedSupport[0], [3 / 5, 0]);
  assertPointClose(knownMappedSupport[1], [6 / 11, 6 / 11]);
  assertPointClose(knownMappedSupport[2], [2 / 3, -2 / 3]);
  for (const [x, y] of knownMappedSupport) {
    assertClose((5 / 3) * x + (1 / 6) * y, 1);
  }

  for (const geodesic of [...arcs, ...diameters]) {
    const [startX, startY] = geodesic.start;
    const chordX = geodesic.end[0] - startX;
    const chordY = geodesic.end[1] - startY;

    assertPointClose(poincareToKlein(geodesic.start), geodesic.start);
    assertPointClose(poincareToKlein(geodesic.end), geodesic.end);

    for (const pointIndex of geodesic.pointIndices) {
      const poincarePoint = points[pointIndex].position;
      const kleinPoint = poincareToKlein(poincarePoint);
      assert.ok(Math.hypot(...kleinPoint) < 1);
      assertClose(
        (kleinPoint[0] - startX) * chordY - (kleinPoint[1] - startY) * chordX,
        0,
      );
      assertPointClose(kleinToPoincare(kleinPoint), poincarePoint);
    }
  }
});

test('the model maps reject invalid or exterior points', () => {
  assert.throws(() => poincareToKlein([Number.NaN, 0]), /finite/);
  assert.throws(() => poincareToKlein([1.01, 0]), /closed unit disk/);
  assert.throws(() => kleinToPoincare({ x: 0, y: Infinity }), /finite/);
  assert.throws(() => kleinToPoincare([0, -1.01]), /closed unit disk/);
});

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
