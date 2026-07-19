import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArrowGeometry2d } from '../src/2d/geometries/ArrowGeometry2d.js';
import { Geometry2d } from '../src/2d/geometries/Geometry2d.js';
import { LineGeometry2d } from '../src/2d/geometries/LineGeometry2d.js';
import { ArrowGeometry } from '../src/3d/geometries/ArrowGeometry.js';
import {
  Geometry,
  VERTEX_SIZE,
} from '../src/3d/geometries/Geometry.js';
import { LineGeometry } from '../src/3d/geometries/LineGeometry.js';

function assertUvRange(geometry, vertexSize, uvOffset) {
  for (let i = uvOffset; i < geometry.vertices.length; i += vertexSize) {
    const u = geometry.vertices[i];
    const v = geometry.vertices[i + 1];
    assert.equal(Number.isFinite(u), true, `vertex ${i / vertexSize} u`);
    assert.equal(Number.isFinite(v), true, `vertex ${i / vertexSize} v`);
    assert.ok(u >= 0 && u <= 1, `vertex ${i / vertexSize} u: ${u}`);
    assert.ok(v >= 0 && v <= 1, `vertex ${i / vertexSize} v: ${v}`);
  }
}

function assertUnitNormalsAndWinding(geometry) {
  const { vertices, indices } = geometry;
  for (let i = 0; i < vertices.length; i += VERTEX_SIZE) {
    const length = Math.hypot(
      vertices[i + 3],
      vertices[i + 4],
      vertices[i + 5],
    );
    assert.ok(
      Math.abs(length - 1) < 1e-6,
      `vertex ${i / VERTEX_SIZE} normal length: ${length}`,
    );
  }

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
    const normalX = vertices[a + 3] + vertices[b + 3] + vertices[c + 3];
    const normalY = vertices[a + 4] + vertices[b + 4] + vertices[c + 4];
    const normalZ = vertices[a + 5] + vertices[b + 5] + vertices[c + 5];

    assert.ok(Math.hypot(nx, ny, nz) > 1e-8, `triangle ${i / 3} area`);
    assert.ok(
      nx * normalX + ny * normalY + nz * normalZ > 0,
      `triangle ${i / 3} winding`,
    );
  }
}

test('LineGeometry builds a centered capped tube', () => {
  const line = new LineGeometry(4, 2, 4);

  assert.equal(line instanceof Geometry, true);
  assert.equal(line.vertexCount, 20);
  assert.equal(line.indexCount, 48);
  assert.deepEqual(line.bounds, {
    min: [-2, -1, -1],
    max: [2, 1, 1],
  });
  assertUnitNormalsAndWinding(line);
  assertUvRange(line, VERTEX_SIZE, 6);
});

test('ArrowGeometry builds a tail-origin tube-and-cone arrow', () => {
  const arrow = new ArrowGeometry(4, 1, 1, 2, 4);

  assert.equal(arrow instanceof Geometry, true);
  assert.equal(arrow.vertexCount, 35);
  assert.equal(arrow.indexCount, 72);
  assert.deepEqual(arrow.bounds, {
    min: [0, -1, -1],
    max: [4, 1, 1],
  });
  assertUnitNormalsAndWinding(arrow);
  assertUvRange(arrow, VERTEX_SIZE, 6);
});

test('3D line and arrow geometries enforce at least three radial segments', () => {
  assert.equal(new LineGeometry(1, 0.1, 2).vertexCount, 16);
  assert.equal(new ArrowGeometry(1, 0.05, 0.25, 0.2, 2).vertexCount, 27);
});

test('LineGeometry2d builds a centered filled line with exact picking', () => {
  const line = new LineGeometry2d(4, 2);

  assert.equal(line instanceof Geometry2d, true);
  assert.equal(line.vertexCount, 4);
  assert.equal(line.indexCount, 6);
  assert.deepEqual(Array.from(line.indices), [0, 1, 2, 0, 2, 3]);
  assert.deepEqual(line.bounds, { min: [-2, -1], max: [2, 1] });
  assert.equal(line.containsPoint(0, 0.75), true);
  assert.equal(line.containsPoint(0, 1.01), false);
  assert.equal(line.containsPoint(2.01, 0), false);
  assertUvRange(line, 4, 2);
});

test('ArrowGeometry2d builds a tail-origin filled arrow with exact picking', () => {
  const arrow = new ArrowGeometry2d(4, 1, 1, 2);

  assert.equal(arrow instanceof Geometry2d, true);
  assert.equal(arrow.vertexCount, 7);
  assert.equal(arrow.indexCount, 9);
  assert.deepEqual(
    Array.from(arrow.indices),
    [0, 1, 2, 0, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(arrow.bounds, { min: [0, -1], max: [4, 1] });

  assert.equal(arrow.containsPoint(0, 0), true, 'tail origin');
  assert.equal(arrow.containsPoint(0.5, 0.4), true, 'shaft');
  assert.equal(
    arrow.containsPoint(0.5, 0.75),
    false,
    'outside shaft but inside bounds',
  );
  assert.equal(arrow.containsPoint(3.5, 0.4), true, 'tapered head');
  assert.equal(
    arrow.containsPoint(3.5, 0.6),
    false,
    'outside tapered head but inside bounds',
  );
  assert.equal(arrow.containsPoint(4, 0), true, 'tip');
  assertUvRange(arrow, 4, 2);
});
