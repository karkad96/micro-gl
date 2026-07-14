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
