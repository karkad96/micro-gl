import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pipelines } from '../src/3d/core/Pipelines.js';
import { Pipelines2d } from '../src/2d/core/Pipelines2d.js';
import { TextureMaterial } from '../src/3d/materials/TextureMaterial.js';
import { SpriteMaterial2d } from '../src/2d/materials/SpriteMaterial2d.js';

// Enough of a GPUDevice for the pipeline caches' constructors; the
// guard under test throws before any pipeline is actually built.
// Node has no WebGPU globals, so shim the one constant they read.
globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const fakeDevice = {
  createBindGroupLayout: () => ({}),
  createPipelineLayout: () => ({}),
};

test('map-requiring materials refuse construction without one', () => {
  assert.throws(() => new TextureMaterial(), /requires/);
  assert.throws(() => new SpriteMaterial2d(), /requires/);
});

test('a TextureMaterial whose map was cleared fails with a clear error', () => {
  const pipelines = new Pipelines(fakeDevice, 'bgra8unorm');
  const material = new TextureMaterial({ map: {} });
  material.map = null;
  assert.throws(
    () => pipelines.pipelineFor(material),
    /TextureMaterial.*map.*was cleared/,
  );
});

test('a SpriteMaterial2d whose map was cleared fails with a clear error', () => {
  const pipelines = new Pipelines2d(fakeDevice, 'bgra8unorm');
  const material = new SpriteMaterial2d({ map: {} });
  material.map = null;
  assert.throws(
    () => pipelines.pipelineFor(material),
    /SpriteMaterial2d.*map.*was cleared/,
  );
});
