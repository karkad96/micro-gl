import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PointerControls } from '../src/core/PointerControls.js';

const EPS = 1e-9;

function assertClose(actual, expected, message = '') {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${message} expected ${expected}, got ${actual}`,
  );
}

/** Just enough DOM element for PointerControls: listeners + geometry. */
class FakeElement {
  constructor() {
    this.style = {};
    this.clientHeight = 100;
    this._listeners = new Map();
  }
  addEventListener(type, handler) {
    this._listeners.set(type, handler);
  }
  removeEventListener(type) {
    this._listeners.delete(type);
  }
  dispatch(type, event) {
    this._listeners.get(type)?.(event);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() {
    return false;
  }
}

/** Records the camera-math calls the gestures produce. */
class RecordingControls extends PointerControls {
  constructor(domElement) {
    super(domElement);
    this.calls = [];
  }
  _pan(dx, dy) {
    this.calls.push(['pan', dx, dy]);
  }
  _rotate(rx, ry) {
    this.calls.push(['rotate', rx, ry]);
  }
  _zoom(factor, ndcX, ndcY) {
    this.calls.push(['zoom', factor, ndcX, ndcY]);
  }
}

function touch(pointerId, clientX, clientY) {
  return { pointerType: 'touch', pointerId, clientX, clientY };
}

test('a one-finger touch drag pans by default', () => {
  const element = new FakeElement();
  const controls = new RecordingControls(element);
  element.dispatch('pointerdown', touch(1, 10, 10));
  element.dispatch('pointermove', touch(1, 15, 12));
  assert.deepEqual(controls.calls, [['pan', 5, 2]]);
});

test("singleTouchGesture = 'rotate' makes one finger rotate instead", () => {
  const element = new FakeElement();
  const controls = new RecordingControls(element);
  controls.singleTouchGesture = 'rotate';
  element.dispatch('pointerdown', touch(1, 10, 10));
  element.dispatch('pointermove', touch(1, 20, 10));
  assert.equal(controls.calls.length, 1);
  const [kind, rx, ry] = controls.calls[0];
  assert.equal(kind, 'rotate');
  assertClose(rx, 10 * controls.rotateSpeed);
  assertClose(ry, 0);
});

test('spreading two fingers zooms in toward their midpoint (and pans by its motion)', () => {
  const element = new FakeElement();
  const controls = new RecordingControls(element);
  element.dispatch('pointerdown', touch(1, 40, 50));
  element.dispatch('pointerdown', touch(2, 60, 50)); // pinch distance 20
  element.dispatch('pointermove', touch(1, 30, 50)); // distance now 30

  assert.deepEqual(
    controls.calls.map((c) => c[0]),
    ['pan', 'zoom'],
  );
  const [, dx, dy] = controls.calls[0];
  assertClose(dx, -5, 'midpoint dx:');
  assertClose(dy, 0, 'midpoint dy:');
  const [, factor, ndcX, ndcY] = controls.calls[1];
  assertClose(factor, 20 / 30, 'factor:'); // < 1 zooms in
  assertClose(ndcX, -0.1, 'ndcX:'); // midpoint x = 45 on a 100px element
  assertClose(ndcY, 0, 'ndcY:'); // midpoint y = 50
});

test('lifting one of two fingers hands over to a smooth one-finger drag', () => {
  const element = new FakeElement();
  const controls = new RecordingControls(element);
  element.dispatch('pointerdown', touch(1, 40, 50));
  element.dispatch('pointerdown', touch(2, 60, 50));
  element.dispatch('pointerup', touch(2, 60, 50));
  element.dispatch('pointermove', touch(1, 43, 50));
  assert.deepEqual(controls.calls, [['pan', 3, 0]]);
});

test('disabled controls ignore the wheel and let the page scroll', () => {
  const element = new FakeElement();
  const controls = new RecordingControls(element);
  controls.enabled = false;
  let prevented = false;
  element.dispatch('wheel', {
    deltaY: -100,
    clientX: 50,
    clientY: 50,
    preventDefault: () => (prevented = true),
  });
  assert.equal(prevented, false);
  assert.deepEqual(controls.calls, []);
});

test('mouse right-drag still pans (touch rework left the mouse path alone)', () => {
  const element = new FakeElement();
  const controls = new RecordingControls(element);
  element.dispatch('pointerdown', {
    pointerType: 'mouse',
    pointerId: 1,
    button: 2,
    clientX: 10,
    clientY: 10,
  });
  element.dispatch('pointermove', {
    pointerType: 'mouse',
    pointerId: 1,
    clientX: 14,
    clientY: 7,
  });
  assert.deepEqual(controls.calls, [['pan', 4, -3]]);
});

test('touch-action is claimed on construction and restored on dispose', () => {
  const element = new FakeElement();
  element.style.touchAction = 'pan-y';
  const controls = new PointerControls(element);
  assert.equal(element.style.touchAction, 'none');
  controls.dispose();
  assert.equal(element.style.touchAction, 'pan-y');
});
