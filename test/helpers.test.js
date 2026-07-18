import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridHelper } from '../src/3d/helpers/GridHelper.js';
import { GridHelper2d } from '../src/2d/helpers/GridHelper2d.js';
import { WireframeGeometry } from '../src/3d/geometries/WireframeGeometry.js';
import { BoxGeometry } from '../src/3d/geometries/BoxGeometry.js';
import { PlaneGeometry } from '../src/3d/geometries/PlaneGeometry.js';
import { Mesh } from '../src/3d/core/Mesh.js';
import { Shape2d } from '../src/2d/core/Shape2d.js';
import { Scene2d } from '../src/2d/core/Scene2d.js';
import { Renderer2d } from '../src/2d/core/Renderer2d.js';

test('GridHelper builds (divisions + 1) lines each way with exact bounds', () => {
  const grid = new GridHelper(10, 4, [1, 0, 0]);
  assert.ok(grid instanceof Mesh);
  // 5 grid positions x 2 directions x 2 endpoints.
  assert.equal(grid.geometry.vertexCount, 20);
  assert.equal(grid.geometry.indexCount, 20);
  assert.equal(grid.material.topology, 'line-list');
  assert.deepEqual(grid.material.color, [1, 0, 0]);
  assert.deepEqual(grid.geometry.bounds.min, [-5, 0, -5]);
  assert.deepEqual(grid.geometry.bounds.max, [5, 0, 5]);
});

test('GridHelper2d builds an XY grid collected by Renderer2d', () => {
  const grid = new GridHelper2d(10, 4, [1, 0, 0]);
  assert.ok(grid instanceof Shape2d);
  // 5 grid positions x 2 directions x 2 endpoints.
  assert.equal(grid.geometry.vertexCount, 20);
  assert.equal(grid.geometry.indexCount, 20);
  assert.equal(grid.material.topology, 'line-list');
  assert.deepEqual(grid.material.color, [1, 0, 0]);
  assert.deepEqual(grid.geometry.bounds.min, [-5, -5]);
  assert.deepEqual(grid.geometry.bounds.max, [5, 5]);

  const scene = new Scene2d();
  scene.add(grid);
  const renderer = new Renderer2d({});
  const drawList = renderer._collectShapes(scene);
  assert.equal(drawList.length, 1);
  assert.equal(drawList[0], grid);
  assert.equal(renderer.drawCount, 1);
});

test('WireframeGeometry extracts unique edges and shares the vertex array', () => {
  const box = new BoxGeometry();
  const wire = new WireframeGeometry(box);
  assert.equal(wire.vertices, box.vertices); // shared, not copied
  // 6 faces x 5 unique edges (4 sides + 1 shared diagonal) x 2 indices.
  assert.equal(wire.indexCount, 60);

  // A plane's two triangles: 4 sides + 1 diagonal = 5 edges.
  assert.equal(new WireframeGeometry(new PlaneGeometry()).indexCount, 10);
});
