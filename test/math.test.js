import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec2 } from '../src/math/Vec2.js';
import { Vec3 } from '../src/math/Vec3.js';
import { Mat3 } from '../src/math/Mat3.js';
import { Mat4 } from '../src/math/Mat4.js';

const EPS = 1e-5;

function assertClose(actual, expected, message = '') {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${message} expected ${expected}, got ${actual}`,
  );
}

function assertElementsClose(matrix, expected) {
  for (let i = 0; i < expected.length; i++) {
    assertClose(matrix.elements[i], expected[i], `element ${i}:`);
  }
}

// prettier-ignore
const IDENTITY4 = [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1];

test('Mat4.multiply by identity leaves the matrix unchanged', () => {
  const m = new Mat4().compose(
    new Vec3(1, 2, 3),
    new Vec3(0.4, 0.5, 0.6),
    new Vec3(2, 3, 4),
  );
  const before = [...m.elements];
  m.multiply(new Mat4());
  assertElementsClose(m, before);
});

test('Mat4.multiplyMatrices is safe when the target aliases an operand', () => {
  const t = new Mat4().makeTranslation(1, 2, 3);
  t.multiplyMatrices(t, t);
  assertElementsClose(t, new Mat4().makeTranslation(2, 4, 6).elements);
});

test('Mat4.invert undoes compose', () => {
  const m = new Mat4().compose(
    new Vec3(1, -2, 3),
    new Vec3(0.3, -0.8, 1.2),
    new Vec3(2, 0.5, 1.5),
  );
  const product = new Mat4().copy(m).invert().premultiply(m); // m * m^-1
  assertElementsClose(product, IDENTITY4);
});

test('Mat4.transpose applied twice is the original', () => {
  const m = new Mat4().compose(
    new Vec3(1, 2, 3),
    new Vec3(0.5, 0.6, 0.7),
    new Vec3(1, 2, 3),
  );
  const before = [...m.elements];
  m.transpose().transpose();
  assertElementsClose(m, before);
});

test('Mat4.perspective maps the near and far planes to depth 0 and 1', () => {
  const proj = new Mat4().perspective(Math.PI / 3, 1.5, 0.1, 100);
  assertClose(new Vec3(0, 0, -0.1).applyMat4(proj).z, 0, 'near plane:');
  assertClose(new Vec3(0, 0, -100).applyMat4(proj).z, 1, 'far plane:');
});

test('Mat4.orthographic maps the view box onto clip space', () => {
  const proj = new Mat4().orthographic(-2, 2, -1, 1, 0.1, 10);
  const nearCorner = new Vec3(-2, -1, -0.1).applyMat4(proj);
  assertClose(nearCorner.x, -1);
  assertClose(nearCorner.y, -1);
  assertClose(nearCorner.z, 0);
  const farCorner = new Vec3(2, 1, -10).applyMat4(proj);
  assertClose(farCorner.x, 1);
  assertClose(farCorner.y, 1);
  assertClose(farCorner.z, 1);
});

test('Mat4.targetTo with the camera on +Z is the identity orientation', () => {
  const m = new Mat4().targetTo(
    new Vec3(0, 0, 5),
    new Vec3(0, 0, 0),
    new Vec3(0, 1, 0),
  );
  // prettier-ignore
  assertElementsClose(m, [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 5, 1]);
});

test('Mat4.compose applies translation, rotation and scale in TRS order', () => {
  const m = new Mat4().compose(
    new Vec3(10, 0, 0),
    new Vec3(0, 0, Math.PI / 2),
    new Vec3(2, 2, 2),
  );
  // (1,0,0) scaled to (2,0,0), rotated about z to (0,2,0), moved to (10,2,0).
  const p = new Vec3(1, 0, 0).applyMat4(m);
  assertClose(p.x, 10);
  assertClose(p.y, 2);
  assertClose(p.z, 0);
});

test('Mat4.composeDirection aligns +X and preserves translation and scale', () => {
  const position = new Vec3(5, -2, 7);
  const scale = new Vec3(2, 3, 4);
  const m = new Mat4();

  assert.equal(
    m.composeDirection(position, { x: 3, y: 4, z: 0 }, scale),
    m,
  );
  // prettier-ignore
  assertElementsClose(m, [1.2, 1.6, 0, 0,  -2.4, 1.8, 0, 0,  0, 0, 4, 0,  5, -2, 7, 1]);

  const scaledArrayDirection = new Mat4().composeDirection(
    position,
    [30, 40, 0],
    scale,
  );
  assertElementsClose(scaledArrayDirection, m.elements);
});

test('Mat4.composeDirection uses a stable basis for vertical directions', () => {
  const m = new Mat4().composeDirection(
    new Vec3(5, -2, 7),
    [0, 9, 0],
    new Vec3(2, 3, 4),
  );
  // Local +X points up while local +Z remains world +Z at the pole.
  // prettier-ignore
  assertElementsClose(m, [0, 2, 0, 0,  -3, 0, 0, 0,  0, 0, 4, 0,  5, -2, 7, 1]);
});

test('Mat3.compose applies translation, rotation and scale in TRS order', () => {
  const m = new Mat3().compose(new Vec2(5, -1), Math.PI / 2, new Vec2(3, 3));
  // (1,0) scaled to (3,0), rotated to (0,3), moved to (5,2).
  const p = new Vec2(1, 0).applyMat3(m);
  assertClose(p.x, 5);
  assertClose(p.y, 2);
});

test('Mat3.composeDirection aligns +X and preserves translation and scale', () => {
  const position = new Vec2(5, -1);
  const scale = new Vec2(2, 3);
  const m = new Mat3();

  assert.equal(m.composeDirection(position, { x: 3, y: 4 }, scale), m);
  // prettier-ignore
  assertElementsClose(m, [1.2, 1.6, 0, 0,  -2.4, 1.8, 0, 0,  5, -1, 1, 0]);

  const scaledArrayDirection = new Mat3().composeDirection(
    position,
    [30, 40],
    scale,
  );
  assertElementsClose(scaledArrayDirection, m.elements);
});

test('composeDirection rejects invalid directions without mutation', () => {
  const m4 = new Mat4().compose(
    new Vec3(1, 2, 3),
    new Vec3(0.2, 0.3, 0.4),
    new Vec3(2, 3, 4),
  );
  const before4 = [...m4.elements];
  for (const direction of [
    [0, 0, 0],
    { x: 1, y: Infinity, z: 0 },
    [1, 0, Number.NaN],
  ]) {
    assert.throws(
      () => m4.composeDirection(new Vec3(), direction, new Vec3(1, 1, 1)),
      RangeError,
    );
    assert.deepEqual([...m4.elements], before4);
  }

  const m3 = new Mat3().compose(new Vec2(1, 2), 0.7, new Vec2(2, 3));
  const before3 = [...m3.elements];
  for (const direction of [
    [0, 0],
    { x: -Infinity, y: 1 },
    [Number.NaN, 1],
  ]) {
    assert.throws(
      () => m3.composeDirection(new Vec2(), direction, new Vec2(1, 1)),
      RangeError,
    );
    assert.deepEqual([...m3.elements], before3);
  }
});

test('Mat3.invert undoes an affine transform', () => {
  const m = new Mat3().compose(new Vec2(2, 3), 0.7, new Vec2(1.5, 0.5));
  const p = new Vec2(4, -2)
    .applyMat3(m)
    .applyMat3(new Mat3().copy(m).invert());
  assertClose(p.x, 4);
  assertClose(p.y, -2);
});

test('Mat3.multiplyMatrices is safe when the target aliases an operand', () => {
  const t = new Mat3().makeTranslation(1, 2);
  t.multiplyMatrices(t, t);
  const p = new Vec2(0, 0).applyMat3(t);
  assertClose(p.x, 2);
  assertClose(p.y, 4);
});

test('Vec3 cross product and normalize', () => {
  const v = new Vec3().crossVectors(new Vec3(2, 0, 0), new Vec3(0, 3, 0));
  assertClose(v.x, 0);
  assertClose(v.y, 0);
  assertClose(v.z, 6);
  assertClose(v.normalize().length(), 1);
});

test('Vec2.applyMat3 rotates a point', () => {
  const p = new Vec2(1, 0).applyMat3(new Mat3().makeRotation(Math.PI / 2));
  assertClose(p.x, 0);
  assertClose(p.y, 1);
});

test('vector normalization remains stable for very large finite values', () => {
  const v2 = new Vec2(1e200, 0).normalize();
  const v3 = new Vec3(0, -1e200, 0).normalize();
  assertClose(v2.x, 1);
  assertClose(v2.y, 0);
  assertClose(v3.x, 0);
  assertClose(v3.y, -1);
  assertClose(v3.z, 0);
});
