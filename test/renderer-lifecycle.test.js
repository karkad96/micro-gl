import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/3d/core/Renderer.js';
import { Renderer2d } from '../src/2d/core/Renderer2d.js';
import { acquireDeviceLease } from '../src/core/deviceLease.js';
import { initWebGpu } from '../src/core/initWebGpu.js';

globalThis.GPUTextureUsage ??= { RENDER_ATTACHMENT: 1 };
globalThis.GPUBufferUsage ??= { UNIFORM: 1, COPY_DST: 2 };
globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2 };

function attachmentDevice(created) {
  return {
    createTexture(descriptor) {
      const texture = {
        descriptor,
        destroyed: false,
        createView: () => ({ texture }),
        destroy: () => (texture.destroyed = true),
      };
      created.push(texture);
      return texture;
    },
  };
}

test('3D attachments follow a canvas resized by another shared renderer', () => {
  const canvas = { width: 100, height: 80 };
  const renderer = new Renderer(canvas);
  const created = [];
  renderer.device = attachmentDevice(created);
  renderer.format = 'bgra8unorm';

  renderer._ensureRenderTargets();
  assert.equal(created.length, 2); // depth + MSAA color
  const oldTargets = [...created];

  canvas.width = 240;
  canvas.height = 160;
  renderer._ensureRenderTargets();

  assert.equal(created.length, 4);
  assert.ok(oldTargets.every((texture) => texture.destroyed));
  assert.deepEqual(created[2].descriptor.size, [240, 160]);
  assert.deepEqual(created[3].descriptor.size, [240, 160]);
});

test('2D MSAA follows a canvas resized by another shared renderer', () => {
  const canvas = { width: 100, height: 80 };
  const renderer = new Renderer2d(canvas);
  const created = [];
  renderer.device = attachmentDevice(created);
  renderer.format = 'bgra8unorm';

  renderer._ensureRenderTargets();
  const oldTarget = created[0];
  canvas.width = 240;
  canvas.height = 160;
  renderer._ensureRenderTargets();

  assert.equal(created.length, 2);
  assert.equal(oldTarget.destroyed, true);
  assert.deepEqual(created[1].descriptor.size, [240, 160]);
});

test('shared device ownership transfers until the last renderer is disposed', () => {
  const events = [];
  const canvas = {};
  const gpu = {
    device: { destroy: () => events.push('device') },
    context: { unconfigure: () => events.push('context') },
    format: 'bgra8unorm',
  };
  const owner = new Renderer(canvas);
  Object.assign(owner, gpu);
  acquireDeviceLease(owner, gpu);

  const borrower = new Renderer2d(canvas);
  Object.assign(borrower, gpu);
  acquireDeviceLease(borrower, owner, owner);

  owner.dispose();
  assert.deepEqual(events, []);
  assert.equal(borrower._ownsDevice, true);

  borrower.dispose();
  assert.deepEqual(events, ['context', 'device']);
});

test('sharing a device across different canvases is rejected', () => {
  const gpu = { device: {}, context: {}, format: 'bgra8unorm' };
  const owner = new Renderer({});
  Object.assign(owner, gpu);
  acquireDeviceLease(owner, gpu);

  const borrower = new Renderer2d({});
  assert.throws(
    () => acquireDeviceLease(borrower, owner, owner),
    /same canvas/,
  );
});

test('a raw WebGPU setup cannot be shared with a different canvas', () => {
  const sourceCanvas = {};
  const gpu = {
    device: {},
    context: {},
    format: 'bgra8unorm',
    canvas: sourceCanvas,
  };
  const borrower = new Renderer2d({});
  assert.throws(
    () => acquireDeviceLease(borrower, gpu, gpu),
    /same canvas/,
  );
});

function initializationDevice(events = []) {
  return {
    lost: new Promise(() => {}),
    queue: {},
    createBindGroupLayout: (descriptor) => ({ descriptor }),
    createPipelineLayout: (descriptor) => ({ descriptor }),
    createBuffer: (descriptor) => ({
      descriptor,
      destroy: () => events.push('buffer'),
    }),
    createBindGroup: (descriptor) => ({ descriptor }),
    createTexture: (descriptor) => ({
      descriptor,
      createView() {
        return { texture: this };
      },
      destroy: () => events.push('texture'),
    }),
    destroy: () => events.push('device'),
  };
}

test('concurrent init calls share one adapter/device request', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  let releaseAdapter;
  const adapterGate = new Promise((resolve) => {
    releaseAdapter = resolve;
  });
  let requests = 0;
  let configurations = 0;
  const context = {
    configure: () => configurations++,
    unconfigure() {},
  };
  const device = initializationDevice();
  const gpu = {
    async requestAdapter() {
      requests++;
      await adapterGate;
      return { requestDevice: async () => device };
    },
    getPreferredCanvasFormat: () => 'bgra8unorm',
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { gpu },
  });

  try {
    const canvas = {
      clientWidth: 100,
      clientHeight: 80,
      getContext: () => context,
    };
    const renderer = new Renderer(canvas, { antialias: false });
    const first = renderer.init();
    const second = renderer.init();
    assert.equal(requests, 1);

    releaseAdapter();
    assert.deepEqual(await Promise.all([first, second]), [renderer, renderer]);
    assert.equal(configurations, 1);
    renderer.dispose();
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete globalThis.navigator;
    }
  }
});

test('failed shared initialization rolls back device-lease membership', async () => {
  const events = [];
  const canvas = { clientWidth: 100, clientHeight: 80 };
  const device = initializationDevice(events);
  device.createBindGroupLayout = () => {
    throw new Error('layout creation failed');
  };
  const gpu = {
    device,
    context: { unconfigure: () => events.push('context') },
    format: 'bgra8unorm',
  };
  const owner = new Renderer(canvas);
  Object.assign(owner, gpu);
  acquireDeviceLease(owner, gpu);

  const borrower = new Renderer2d(canvas);
  await assert.rejects(() => borrower.init(owner), /layout creation failed/);

  assert.deepEqual([...owner._deviceLease.members], [owner]);
  assert.equal(borrower._deviceLease, null);
  assert.equal(borrower.device, null);
  owner.dispose();
  assert.deepEqual(events, ['context', 'device']);
});

test('concurrent shared init calls are coalesced too', async () => {
  const canvas = { clientWidth: 100, clientHeight: 80 };
  const device = initializationDevice();
  const gpu = {
    device,
    context: { unconfigure() {} },
    format: 'bgra8unorm',
  };
  const owner = new Renderer(canvas);
  Object.assign(owner, gpu);
  acquireDeviceLease(owner, gpu);
  const borrower = new Renderer2d(canvas, { antialias: false });

  const first = borrower.init(owner);
  const second = borrower.init(owner);
  assert.deepEqual(await Promise.all([first, second]), [borrower, borrower]);

  borrower.dispose();
  owner.dispose();
});

test('disposing during shared init rejects instead of fulfilling unusably', async () => {
  const canvas = { clientWidth: 100, clientHeight: 80 };
  const device = initializationDevice();
  const gpu = {
    device,
    context: { unconfigure() {} },
    format: 'bgra8unorm',
  };
  const owner = new Renderer(canvas);
  Object.assign(owner, gpu);
  acquireDeviceLease(owner, gpu);
  const borrower = new Renderer2d(canvas, { antialias: false });

  const initialization = borrower.init(owner);
  borrower.dispose();

  await assert.rejects(initialization, /cancelled by dispose/);
  assert.equal(borrower.device, null);
  assert.deepEqual([...owner._deviceLease.members], [owner]);
  owner.dispose();
});

test('canvas setup failure destroys the already-requested device', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  const events = [];
  const device = initializationDevice(events);
  const context = {
    configure() {
      throw new Error('canvas configuration failed');
    },
    unconfigure: () => events.push('context'),
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => device,
        }),
        getPreferredCanvasFormat: () => 'bgra8unorm',
      },
    },
  });

  try {
    await assert.rejects(
      () => initWebGpu({ getContext: () => context }),
      /canvas configuration failed/,
    );
    assert.deepEqual(events, ['context', 'device']);
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete globalThis.navigator;
    }
  }
});
