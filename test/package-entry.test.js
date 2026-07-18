import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as packageEntry from 'micro-gl';
import * as sourceEntry from '../src/index.js';

test('the package name resolves to the complete public entry point', () => {
  assert.deepEqual(Object.keys(packageEntry), Object.keys(sourceEntry));
  for (const name of Object.keys(sourceEntry)) {
    assert.equal(packageEntry[name], sourceEntry[name], name);
  }
});

test('line, arrow and grid helpers are part of the public API', () => {
  for (const name of [
    'LineGeometry',
    'ArrowGeometry',
    'LineGeometry2d',
    'ArrowGeometry2d',
    'GridHelper',
    'GridHelper2d',
  ]) {
    assert.equal(typeof packageEntry[name], 'function', name);
  }
});
