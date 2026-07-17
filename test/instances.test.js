import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InstancedMesh,
  INSTANCE_SIZE,
} from '../src/3d/core/InstancedMesh.js';
import {
  InstancedShape2d,
  INSTANCE_SIZE_2D,
} from '../src/2d/core/InstancedShape2d.js';
import { Renderer2d } from '../src/2d/core/Renderer2d.js';
import { Scene2d } from '../src/2d/core/Scene2d.js';
import { Geometry } from '../src/3d/geometries/Geometry.js';
import { Geometry2d } from '../src/2d/geometries/Geometry2d.js';
import { Mat3 } from '../src/math/Mat3.js';
import { Mat4 } from '../src/math/Mat4.js';

const instanceCases = [
  {
    label: 'InstancedMesh',
    instanceSize: INSTANCE_SIZE,
    createMatrix: () => new Mat4(),
    create(capacity) {
      return new InstancedMesh(
        new Geometry([0, 0, 0, 0, 0, 1, 0, 0], [0]),
        { map: null },
        capacity,
      );
    },
  },
  {
    label: 'InstancedShape2d',
    instanceSize: INSTANCE_SIZE_2D,
    createMatrix: () => new Mat3(),
    create(capacity) {
      return new InstancedShape2d(
        new Geometry2d([0, 0, 0, 0], [0]),
        { map: null },
        capacity,
      );
    },
  },
];

for (const {
  label,
  instanceSize,
  createMatrix,
  create,
} of instanceCases) {
  test(`${label} requires a non-negative integer capacity`, () => {
    for (const capacity of [-1, 1.5, NaN, Infinity, '2', undefined]) {
      assert.throws(
        () => create(capacity),
        { name: 'RangeError', message: /capacity/ },
      );
    }

    const empty = create(0);
    assert.equal(empty.capacity, 0);
    assert.equal(empty.count, 0);
    assert.equal(empty.instanceData.length, 0);
  });

  test(`${label} keeps capacity fixed and bounds the active count`, () => {
    const object = create(3);
    const storage = object.instanceData;

    assert.equal(object.capacity, 3);
    assert.equal(object.count, 3);
    assert.equal(storage.length, 3 * instanceSize);

    object.count = 1;
    assert.equal(object.count, 1);
    object.count = 0;
    assert.equal(object.count, 0);
    object.count = object.capacity;
    assert.equal(object.count, 3);

    for (const count of [-1, 1.5, 4, NaN, Infinity, '2']) {
      assert.throws(
        () => {
          object.count = count;
        },
        { name: 'RangeError', message: /\.count.*capacity/ },
      );
      assert.equal(object.count, 3);
    }

    assert.throws(() => {
      object.capacity = 4;
    }, TypeError);
    assert.throws(() => {
      object.instanceData = new Float32Array(4 * instanceSize);
    }, TypeError);
    assert.equal(object.capacity, 3);
    assert.equal(object.instanceData, storage);

    storage[0] = 7;
    assert.equal(object.instanceData[0], 7);
  });

  test(`${label} validates indices against capacity, not count`, () => {
    const object = create(3);
    object.count = 1;

    // Inactive records can be prepared before count grows.
    object.setMatrixAt(2, createMatrix());
    object.setColorAt(2, [1, 1, 1]);

    const beforeInvalidWrites = Array.from(object.instanceData);
    for (const index of [-1, 1.5, 3, NaN, Infinity]) {
      assert.throws(
        () => object.setMatrixAt(index, createMatrix()),
        { name: 'RangeError', message: /instance index/ },
      );
      assert.throws(
        () => object.setColorAt(index, [1, 1, 1]),
        { name: 'RangeError', message: /instance index/ },
      );
    }
    assert.deepEqual(Array.from(object.instanceData), beforeInvalidWrites);
  });
}

test('Renderer2d skips instanced shapes with no active instances', () => {
  const scene = new Scene2d();
  const renderer = new Renderer2d({});
  const shape = instanceCases[1].create(3);
  const empty = instanceCases[1].create(0);
  shape.count = 2;
  scene.add(shape).add(empty);

  assert.deepEqual(renderer._collectShapes(scene), [shape]);
  assert.equal(renderer.drawCount, 2);

  shape.count = 0;
  assert.deepEqual(renderer._collectShapes(scene), []);
  assert.equal(renderer.drawCount, 0);
});
