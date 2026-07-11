import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srgbToLinear, linearToSrgb } from '../src/math/color.js';

const EPS = 1e-6;

function assertClose(actual, expected, message = '') {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${message} expected ${expected}, got ${actual}`,
  );
}

test('srgbToLinear keeps the endpoints and darkens midtones', () => {
  assertClose(srgbToLinear(0), 0);
  assertClose(srgbToLinear(1), 1);
  // The canonical value: mid gray 0.5 is ~0.2140 in linear light.
  assertClose(srgbToLinear(0.5), 0.21404114);
});

test('linearToSrgb inverts srgbToLinear across the range', () => {
  for (let i = 0; i <= 20; i++) {
    const c = i / 20;
    assertClose(linearToSrgb(srgbToLinear(c)), c, `channel ${c}:`);
  }
});
