import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/3d/core/Scene.js';
import { Object3d } from '../src/3d/core/Object3d.js';
import { Renderer } from '../src/3d/core/Renderer.js';
import { AmbientLight } from '../src/3d/lights/AmbientLight.js';
import { DirectionalLight } from '../src/3d/lights/DirectionalLight.js';
import { PointLight } from '../src/3d/lights/PointLight.js';
import { MAX_POINT_LIGHTS } from '../src/3d/materials/Material.js';
import { Mat4 } from '../src/math/Mat4.js';
import { srgbToLinear } from '../src/math/color.js';

const EPS = 1e-6;

// Float offsets into the frame uniform data, matching Renderer.js.
const DIRECTIONAL_LIGHT_DIRECTION = 16;
const DIRECTIONAL_LIGHT_COLOR = 20;
const AMBIENT_LIGHT_COLOR = 24;
const POINT_LIGHT_COUNT = 27;
const POINT_LIGHTS = 28;
const POINT_LIGHT_STRIDE = 8;

/** Runs the renderer's frame-uniform pass against a stub device. */
function frameUniforms(scene) {
  const renderer = new Renderer({});
  let captured = null;
  renderer.device = { queue: { writeBuffer: (_b, _o, data) => (captured = data) } };
  scene.updateWorldMatrix();
  renderer._writeFrameUniforms(scene, { viewProjectionMatrix: new Mat4() });
  return captured;
}

test('scenes without visible lights upload a neutral lighting multiplier', () => {
  const scene = new Scene();
  const hiddenLight = new AmbientLight([1, 0, 0], 10);
  hiddenLight.visible = false;
  scene.add(hiddenLight);

  const data = frameUniforms(scene);
  assert.deepEqual(
    [...data.slice(DIRECTIONAL_LIGHT_COLOR, DIRECTIONAL_LIGHT_COLOR + 3)],
    [0, 0, 0],
  );
  assert.equal(data[POINT_LIGHT_COUNT], 0);
  for (const channel of data.slice(
    AMBIENT_LIGHT_COLOR,
    AMBIENT_LIGHT_COLOR + 3,
  )) {
    assert.equal(channel, 1);
  }
});

test('any visible explicit light disables the neutral lightless fallback', () => {
  for (const [label, light] of [
    ['ambient', new AmbientLight([1, 1, 1], 0)],
    ['directional', new DirectionalLight([1, 1, 1], 0)],
    ['point', new PointLight([1, 1, 1], 0)],
  ]) {
    const scene = new Scene();
    scene.add(light);

    const data = frameUniforms(scene);
    assert.deepEqual(
      [...data.slice(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_COLOR + 3)],
      [0, 0, 0],
      label,
    );
  }
});

test('directional light directions upload as finite unit vectors', () => {
  const scene = new Scene();
  const light = new DirectionalLight([1, 1, 1], 1);
  scene.add(light);
  const diagonal = 1 / Math.sqrt(3);
  const cases = [
    { label: 'scaled', value: [3, -4, 0], expected: [0.6, -0.8, 0] },
    {
      label: 'huge finite',
      value: [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE],
      expected: [diagonal, -diagonal, diagonal],
    },
    { label: 'zero', value: [0, 0, 0], expected: [0, -1, 0] },
    {
      label: 'near zero',
      value: [1e-13, -1e-13, 0],
      expected: [0, -1, 0],
    },
    { label: 'NaN', value: [1, NaN, 0], expected: [0, -1, 0] },
    {
      label: 'positive infinity',
      value: [1, -1, Infinity],
      expected: [0, -1, 0],
    },
    {
      label: 'negative infinity',
      value: [-Infinity, -1, 0],
      expected: [0, -1, 0],
    },
  ];

  for (const { label, value, expected } of cases) {
    light.direction.set(...value);
    const data = frameUniforms(scene);
    const actual = Array.from(
      data.slice(
        DIRECTIONAL_LIGHT_DIRECTION,
        DIRECTIONAL_LIGHT_DIRECTION + 3,
      ),
    );

    assertDirectionClose(actual, expected, label);
    assert.ok(data.every(Number.isFinite), `${label}: frame data is finite`);
    assert.deepEqual(
      Array.from(
        data.slice(
          DIRECTIONAL_LIGHT_COLOR,
          DIRECTIONAL_LIGHT_COLOR + 3,
        ),
      ),
      [1, 1, 1],
      `${label}: fallback keeps the light enabled`,
    );
  }
});

test('point lights upload their world position and premultiplied linear color', () => {
  const scene = new Scene();
  const arm = new Object3d();
  arm.position.set(1, 0, 0);
  const light = new PointLight([1, 0.5, 0], 2);
  light.position.set(0, 2, 0);
  arm.add(light);
  scene.add(arm);

  const data = frameUniforms(scene);
  assert.equal(data[POINT_LIGHT_COUNT], 1);
  // World position: the parent's offset applies.
  assert.deepEqual([...data.slice(POINT_LIGHTS, POINT_LIGHTS + 3)], [1, 2, 0]);
  const color = data.slice(POINT_LIGHTS + 4, POINT_LIGHTS + 7);
  assert.ok(Math.abs(color[0] - srgbToLinear(1) * 2) < EPS);
  assert.ok(Math.abs(color[1] - srgbToLinear(0.5) * 2) < EPS);
  assert.ok(Math.abs(color[2] - 0) < EPS);
});

test('lights beyond MAX_POINT_LIGHTS and invisible ones are ignored', () => {
  const scene = new Scene();
  const hidden = new Object3d();
  hidden.visible = false;
  hidden.add(new PointLight([1, 0, 0], 5));
  scene.add(hidden);
  const lights = [];
  for (let i = 0; i < MAX_POINT_LIGHTS + 2; i++) {
    const light = new PointLight([1, 1, 1], i + 1);
    lights.push(light);
    scene.add(light);
  }

  const data = frameUniforms(scene);
  assert.equal(data[POINT_LIGHT_COUNT], MAX_POINT_LIGHTS);
  // The first MAX_POINT_LIGHTS visible ones won, in traversal order:
  // intensities 1..MAX (the hidden intensity-5 light never uploads).
  for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
    const base = POINT_LIGHTS + i * POINT_LIGHT_STRIDE;
    assert.ok(Math.abs(data[base + 4] - (i + 1)) < EPS, `light ${i}`);
  }
});

function assertDirectionClose(actual, expected, label) {
  assert.ok(actual.every(Number.isFinite), `${label}: direction is finite`);
  assert.ok(
    Math.abs(Math.hypot(...actual) - 1) < EPS,
    `${label}: direction has unit length`,
  );
  for (let index = 0; index < 3; index++) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) < EPS,
      `${label}: component ${index} expected ${expected[index]}, got ${actual[index]}`,
    );
  }
}
