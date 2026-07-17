import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectionalShadow as PublicDirectionalShadow } from '../src/index.js';
import { createMaterialPipelineLayouts } from '../src/core/createMaterialPipelineLayouts.js';
import {
  INDEX_FORMAT,
  SHADER_BIND_GROUP,
  SHADER_ENTRY_POINT,
  SHADOW_BINDING,
} from '../src/core/pipelineConstants.js';
import {
  DIRECTIONAL_SHADOW_DEPTH_FORMAT,
  SHADOW_SAMPLE_COUNT,
} from '../src/3d/constants.js';
import { DirectionalShadowMap, SHADOW_UNIFORM_OFFSET } from '../src/3d/core/DirectionalShadowMap.js';
import { Mesh } from '../src/3d/core/Mesh.js';
import { Renderer } from '../src/3d/core/Renderer.js';
import { ShadowPipelines } from '../src/3d/core/ShadowPipelines.js';
import { OBJECT_UNIFORM_OFFSET } from '../src/3d/core/Uniforms.js';
import { OrthographicCamera } from '../src/3d/cameras/OrthographicCamera.js';
import { DirectionalLight } from '../src/3d/lights/DirectionalLight.js';
import {
  DEFAULT_SHADOW_BIAS,
  DEFAULT_SHADOW_CAMERA_SIZE,
  DEFAULT_SHADOW_FAR,
  DEFAULT_SHADOW_MAP_SIZE,
  DEFAULT_SHADOW_NEAR,
  DEFAULT_SHADOW_NORMAL_BIAS,
  DirectionalShadow,
} from '../src/3d/lights/DirectionalShadow.js';
import { BasicMaterial } from '../src/3d/materials/BasicMaterial.js';
import { DIRECTIONAL_SHADOW_SHADER } from '../src/3d/shaders/shadows.js';
import { SHARED_SHADER_CHUNKS } from '../src/3d/shaders/shared.js';
import {
  INSTANCE_VERTEX_BUFFER_LAYOUT,
  vertexBufferLayouts,
} from '../src/3d/shaders/vertexLayout.js';

// Node does not expose WebGPU constants. These values only need distinct bits
// because the fake device records descriptors instead of using them.
globalThis.GPUBufferUsage ??= { COPY_DST: 1, UNIFORM: 2 };
globalThis.GPUTextureUsage ??= {
  RENDER_ATTACHMENT: 1,
  TEXTURE_BINDING: 2,
};
globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };

test('directional shadows have safe opt-in defaults and a public API', () => {
  const shadow = new DirectionalShadow();
  const light = new DirectionalLight();
  const secondLight = new DirectionalLight();
  const mesh = new Mesh({}, {});

  assert.equal(PublicDirectionalShadow, DirectionalShadow);
  assert.equal(shadow.mapSize, DEFAULT_SHADOW_MAP_SIZE);
  assert.equal(shadow.bias, DEFAULT_SHADOW_BIAS);
  assert.equal(shadow.normalBias, DEFAULT_SHADOW_NORMAL_BIAS);
  assert.ok(shadow.camera instanceof OrthographicCamera);
  assert.equal(shadow.camera.size, DEFAULT_SHADOW_CAMERA_SIZE);
  assert.equal(shadow.camera.aspect, 1);
  assert.equal(shadow.camera.near, DEFAULT_SHADOW_NEAR);
  assert.equal(shadow.camera.far, DEFAULT_SHADOW_FAR);

  assert.equal(light.castShadow, false);
  assert.ok(light.shadow instanceof DirectionalShadow);
  assert.notEqual(light.shadow, secondLight.shadow);
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
});

test('3D layouts reserve a depth texture and comparison sampler for shadows', () => {
  const device = fakeGpuDevice();
  const layouts = createMaterialPipelineLayouts(
    device,
    GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    { shadows: true },
  );
  const entries = layouts.shadowBindGroupLayout.descriptor.entries;

  assert.deepEqual(entries.map(({ binding }) => binding), [
    SHADOW_BINDING.uniforms,
    SHADOW_BINDING.map,
    SHADOW_BINDING.sampler,
  ]);
  assert.deepEqual(entries[0], {
    binding: SHADOW_BINDING.uniforms,
    visibility: GPUShaderStage.FRAGMENT,
    buffer: {},
  });
  assert.deepEqual(entries[1].texture, { sampleType: 'depth' });
  assert.deepEqual(entries[2].sampler, { type: 'comparison' });
  assert.equal(
    layouts.pipelineLayout.descriptor.bindGroupLayouts[
      SHADER_BIND_GROUP.shadow
    ],
    layouts.shadowBindGroupLayout,
  );
  assert.equal(
    layouts.texturedPipelineLayout.descriptor.bindGroupLayouts[
      SHADER_BIND_GROUP.shadow
    ],
    layouts.shadowBindGroupLayout,
  );

  const layoutsWithoutShadows = createMaterialPipelineLayouts(
    device,
    GPUShaderStage.VERTEX,
  );
  assert.equal(layoutsWithoutShadows.shadowBindGroupLayout, null);
  assert.equal(
    layoutsWithoutShadows.pipelineLayout.descriptor.bindGroupLayouts.length,
    2,
  );
});

test('shadow maps upload camera parameters, resize lazily and disable cleanly', () => {
  const device = fakeGpuDevice({ maxTextureDimension2D: 2048 });
  const shadowMap = new DirectionalShadowMap(device, {}, {});
  const fallbackTexture = device.textures[0];
  const fallbackBindGroup = shadowMap.bindGroup;

  assert.deepEqual(fallbackTexture.descriptor.size, [1, 1]);
  assert.equal(latestUniformWrite(device)[SHADOW_UNIFORM_OFFSET.enabled], 0);
  assert.equal(latestUniformWrite(device)[SHADOW_UNIFORM_OFFSET.texelSize], 1);

  const light = new DirectionalLight();
  light.castShadow = true;
  light.direction.set(0, -2, 0);
  light.shadow.mapSize = 64;
  light.shadow.bias = 0.004;
  light.shadow.normalBias = 0.03;
  light.shadow.camera.lookAt(2, 3, 4);

  assert.equal(shadowMap.update(light), true);
  assert.equal(shadowMap.enabled, true);
  assert.equal(device.textures.length, 2);
  assert.equal(fallbackTexture.destroyed, true);
  assert.notEqual(shadowMap.bindGroup, fallbackBindGroup);
  assert.deepEqual(device.textures[1].descriptor, {
    label: 'Directional shadow map',
    size: [64, 64],
    format: DIRECTIONAL_SHADOW_DEPTH_FORMAT,
    sampleCount: SHADOW_SAMPLE_COUNT,
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING,
  });

  const uploaded = latestUniformWrite(device);
  assert.equal(uploaded[SHADOW_UNIFORM_OFFSET.enabled], 1);
  assert.ok(Math.abs(uploaded[SHADOW_UNIFORM_OFFSET.bias] - 0.004) < 1e-6);
  assert.ok(
    Math.abs(uploaded[SHADOW_UNIFORM_OFFSET.normalBias] - 0.03) < 1e-6,
  );
  assert.equal(uploaded[SHADOW_UNIFORM_OFFSET.texelSize], 1 / 64);
  assert.ok(
    uploaded
      .slice(SHADOW_UNIFORM_OFFSET.viewProjection, SHADOW_UNIFORM_OFFSET.enabled)
      .every(Number.isFinite),
  );
  assert.equal(light.shadow.camera.position.x, 2);
  assert.equal(light.shadow.camera.position.z, 4);
  assert.ok(Math.abs(light.shadow.camera.position.y - 28.05) < 1e-6);

  const textureAt64 = device.textures[1];
  const bindGroupAt64 = shadowMap.bindGroup;
  shadowMap.update(light);
  assert.equal(device.textures.length, 2);
  assert.equal(shadowMap.bindGroup, bindGroupAt64);

  light.shadow.mapSize = 128;
  shadowMap.update(light);
  assert.equal(device.textures.length, 3);
  assert.equal(textureAt64.destroyed, true);
  assert.deepEqual(device.textures[2].descriptor.size, [128, 128]);
  assert.equal(latestUniformWrite(device)[SHADOW_UNIFORM_OFFSET.texelSize], 1 / 128);

  assert.equal(shadowMap.update(null), false);
  assert.equal(shadowMap.enabled, false);
  const disabled = latestUniformWrite(device);
  assert.equal(disabled[SHADOW_UNIFORM_OFFSET.enabled], 0);
  assert.deepEqual(disabled.slice(0, 16), [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
});

test('shadow cameras share the finite directional-light policy', () => {
  const device = fakeGpuDevice();
  const shadowMap = new DirectionalShadowMap(device, {}, {});
  const light = new DirectionalLight();
  light.castShadow = true;
  light.shadow.mapSize = 32;
  light.shadow.camera.lookAt(2, 3, 4);
  const diagonal = 1 / Math.sqrt(3);
  const cases = [
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
      label: 'infinity',
      value: [1, -1, Infinity],
      expected: [0, -1, 0],
    },
  ];
  const camera = light.shadow.camera;
  const distance = (camera.near + camera.far) / 2;

  for (const { label, value, expected } of cases) {
    light.direction.set(...value);
    assert.equal(shadowMap.update(light), true, label);

    const cameraDirection = [
      (camera.target.x - camera.position.x) / distance,
      (camera.target.y - camera.position.y) / distance,
      (camera.target.z - camera.position.z) / distance,
    ];
    assertVectorClose(cameraDirection, expected, label);
    assert.ok(
      latestUniformWrite(device)
        .slice(
          SHADOW_UNIFORM_OFFSET.viewProjection,
          SHADOW_UNIFORM_OFFSET.enabled,
        )
        .every(Number.isFinite),
      `${label}: shadow matrix is finite`,
    );
  }
});

test('invalid directional shadow configuration fails before rendering', () => {
  const device = fakeGpuDevice({ maxTextureDimension2D: 512 });
  const shadowMap = new DirectionalShadowMap(device, {}, {});

  assertInvalidShadow(shadowMap, (light) => {
    light.shadow = null;
  }, /DirectionalLight\.shadow/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.mapSize = 0;
  }, /positive integer/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.mapSize = 1.5;
  }, /positive integer/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.mapSize = 1024;
  }, /cannot exceed 512/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.bias = Infinity;
  }, /biases must be finite/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.normalBias = Number.NaN;
  }, /biases must be finite/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.camera.size = 0;
  }, /camera size must be positive/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.camera.zoom = 0;
  }, /camera zoom must be positive/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.camera.near = -1;
  }, /0 <= near < far/);
  assertInvalidShadow(shadowMap, (light) => {
    light.shadow.camera.far = light.shadow.camera.near;
  }, /0 <= near < far/);
});

test('shadow pipelines cache regular, instanced and triangle-strip variants', () => {
  const device = fakeGpuDevice();
  const pipelines = new ShadowPipelines(device, {}, {});
  const material = new BasicMaterial();

  const regular = pipelines.pipelineFor(material);
  assert.equal(pipelines.pipelineFor(material), regular);
  const instanced = pipelines.pipelineFor(material, true);
  const strip = pipelines.pipelineFor(
    new BasicMaterial({ topology: 'triangle-strip' }),
  );

  assert.equal(device.shaderModules.length, 1);
  assert.equal(device.renderPipelines.length, 3);
  assert.equal(regular.descriptor.vertex.entryPoint, SHADER_ENTRY_POINT.shadowVertex);
  assert.equal(regular.descriptor.vertex.buffers, vertexBufferLayouts(false));
  assert.equal(regular.descriptor.fragment, undefined);
  assert.deepEqual(regular.descriptor.depthStencil, {
    format: DIRECTIONAL_SHADOW_DEPTH_FORMAT,
    depthWriteEnabled: true,
    depthCompare: 'less',
  });
  assert.deepEqual(regular.descriptor.multisample, { count: SHADOW_SAMPLE_COUNT });
  assert.equal(
    instanced.descriptor.vertex.entryPoint,
    SHADER_ENTRY_POINT.shadowInstancedVertex,
  );
  assert.equal(instanced.descriptor.vertex.buffers[1], INSTANCE_VERTEX_BUFFER_LAYOUT);
  assert.equal(strip.descriptor.primitive.stripIndexFormat, INDEX_FORMAT);
});

test('the shadow pass binds caster resources and counts instanced draws', () => {
  const device = fakeGpuDevice();
  const shadowMap = new DirectionalShadowMap(device, {}, {});
  const light = new DirectionalLight();
  light.castShadow = true;
  light.shadow.mapSize = 32;
  shadowMap.update(light);

  const regular = fakeCaster(false, 1);
  const instanced = fakeCaster(true, 3);
  const encoder = fakeCommandEncoder();
  const drawCount = shadowMap.render(encoder, [regular, instanced]);
  const { descriptor, calls } = encoder.pass;

  assert.equal(drawCount, 4);
  assert.deepEqual(descriptor.colorAttachments, []);
  assert.equal(descriptor.depthStencilAttachment.depthClearValue, 1);
  assert.equal(descriptor.depthStencilAttachment.depthLoadOp, 'clear');
  assert.equal(descriptor.depthStencilAttachment.depthStoreOp, 'store');
  assert.deepEqual(
    calls.filter(([name]) => name === 'setBindGroup').map(([, group]) => group),
    [SHADER_BIND_GROUP.frame, SHADER_BIND_GROUP.object, SHADER_BIND_GROUP.object],
  );
  assert.deepEqual(
    calls.filter(([name]) => name === 'drawIndexed').map((call) => call.slice(1)),
    [[6, 1], [6, 3]],
  );
  assert.equal(calls.at(-1)[0], 'end');
});

test('renderer preparation writes receiver flags and deduplicates shadow casters', () => {
  const renderer = new Renderer({});
  const uploads = [];
  renderer.device = {
    queue: {
      writeBuffer(_buffer, _offset, data) {
        uploads.push(Array.from(data));
      },
    },
  };
  renderer._resources = {
    geometryFor: () => ({ vertexBuffer: {}, indexBuffer: {} }),
    meshFor: () => ({
      uniformBuffer: {},
      data: new Float32Array(40),
    }),
  };

  const receiver = new Mesh({}, new BasicMaterial());
  receiver.receiveShadow = true;
  const opaqueCaster = new Mesh({}, new BasicMaterial());
  opaqueCaster.castShadow = true;
  renderer._opaqueList.push(receiver, opaqueCaster);
  renderer._shadowMeshList.push(opaqueCaster);
  renderer._prepareMeshes();

  assert.equal(uploads[0][OBJECT_UNIFORM_OFFSET.shadowFlags], 1);
  assert.equal(uploads[1][OBJECT_UNIFORM_OFFSET.shadowFlags], 0);
  assert.equal(renderer._preparedMeshes.size, 2);
  assert.deepEqual(
    renderer._shadowCasters.map(({ mesh }) => mesh),
    [opaqueCaster],
  );
});

test('shadow map disposal releases its owned GPU allocations', () => {
  const device = fakeGpuDevice();
  const shadowMap = new DirectionalShadowMap(device, {}, {});
  const uniformBuffer = device.buffers[0];
  const texture = device.textures[0];

  shadowMap.dispose();

  assert.equal(uniformBuffer.destroyed, true);
  assert.equal(texture.destroyed, true);
  assert.equal(shadowMap.bindGroup, null);
  assert.equal(shadowMap.enabled, false);
});

test('shadow shaders keep sampling and depth-pass bindings in sync', () => {
  assert.match(DIRECTIONAL_SHADOW_SHADER, /@vertex\s+fn vsShadow\(/);
  assert.match(DIRECTIONAL_SHADOW_SHADER, /@vertex\s+fn vsShadowInstanced\(/);
  assert.doesNotMatch(DIRECTIONAL_SHADOW_SHADER, /@fragment/);
  assert.match(
    DIRECTIONAL_SHADOW_SHADER,
    new RegExp(
      `@group\\(${SHADER_BIND_GROUP.frame}\\)[\\s\\S]*?uShadow`,
    ),
  );
  assert.match(
    DIRECTIONAL_SHADOW_SHADER,
    new RegExp(
      `@group\\(${SHADER_BIND_GROUP.object}\\)[\\s\\S]*?uObject`,
    ),
  );

  assert.match(SHARED_SHADER_CHUNKS, /var uShadowMap: texture_depth_2d/);
  assert.match(SHARED_SHADER_CHUNKS, /var uShadowSampler: sampler_comparison/);
  assert.match(SHARED_SHADER_CHUNKS, /fn directionalShadow\(/);
  assert.match(SHARED_SHADER_CHUNKS, /textureSampleCompareLevel\(/);
  assert.match(SHARED_SHADER_CHUNKS, /for \(var y = -1; y <= 1; y\+\+\)/);
  assert.match(SHARED_SHADER_CHUNKS, /for \(var x = -1; x <= 1; x\+\+\)/);
  assert.match(
    SHARED_SHADER_CHUNKS,
    /uFrame\.lightColor \* shadow;[\s\S]*uFrame\.pointLights\[i\]\.color/,
  );
});

function assertInvalidShadow(shadowMap, configure, expected) {
  const light = new DirectionalLight();
  light.castShadow = true;
  light.shadow.mapSize = 256;
  configure(light);
  assert.throws(() => shadowMap.update(light), expected);
}

function assertVectorClose(actual, expected, label) {
  for (let index = 0; index < expected.length; index++) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) < 1e-6,
      `${label}: component ${index} expected ${expected[index]}, got ${actual[index]}`,
    );
  }
}

function latestUniformWrite(device) {
  return device.writes.at(-1).data;
}

function fakeGpuDevice({ maxTextureDimension2D = 4096 } = {}) {
  const device = {
    limits: { maxTextureDimension2D },
    buffers: [],
    bindGroupLayouts: [],
    bindGroups: [],
    pipelineLayouts: [],
    renderPipelines: [],
    samplers: [],
    shaderModules: [],
    textures: [],
    writes: [],
    queue: {
      writeBuffer(buffer, offset, data) {
        device.writes.push({ buffer, offset, data: Array.from(data) });
      },
    },
    createBuffer(descriptor) {
      const buffer = {
        descriptor,
        destroyed: false,
        destroy() {
          this.destroyed = true;
        },
      };
      device.buffers.push(buffer);
      return buffer;
    },
    createBindGroupLayout(descriptor) {
      const layout = { descriptor };
      device.bindGroupLayouts.push(layout);
      return layout;
    },
    createBindGroup(descriptor) {
      const bindGroup = { descriptor };
      device.bindGroups.push(bindGroup);
      return bindGroup;
    },
    createPipelineLayout(descriptor) {
      const layout = { descriptor };
      device.pipelineLayouts.push(layout);
      return layout;
    },
    createRenderPipeline(descriptor) {
      const pipeline = { descriptor };
      device.renderPipelines.push(pipeline);
      return pipeline;
    },
    createSampler(descriptor) {
      const sampler = { descriptor };
      device.samplers.push(sampler);
      return sampler;
    },
    createShaderModule(descriptor) {
      const module = { descriptor };
      device.shaderModules.push(module);
      return module;
    },
    createTexture(descriptor) {
      const texture = {
        descriptor,
        destroyed: false,
        view: null,
        createView() {
          this.view ??= { texture: this };
          return this.view;
        },
        destroy() {
          this.destroyed = true;
        },
      };
      device.textures.push(texture);
      return texture;
    },
  };
  return device;
}

function fakeCaster(isInstanced, count) {
  return {
    mesh: {
      isInstanced,
      count,
      geometry: { indexCount: 6 },
      material: new BasicMaterial(),
    },
    geometryGPU: {
      vertexBuffer: {},
      indexBuffer: {},
    },
    meshGPU: {
      shadowBindGroup: {},
      instanceBuffer: {},
    },
  };
}

function fakeCommandEncoder() {
  const encoder = {
    pass: null,
    beginRenderPass(descriptor) {
      const calls = [];
      encoder.pass = {
        descriptor,
        calls,
        setBindGroup(...args) {
          calls.push(['setBindGroup', ...args]);
        },
        setPipeline(...args) {
          calls.push(['setPipeline', ...args]);
        },
        setVertexBuffer(...args) {
          calls.push(['setVertexBuffer', ...args]);
        },
        setIndexBuffer(...args) {
          calls.push(['setIndexBuffer', ...args]);
        },
        drawIndexed(...args) {
          calls.push(['drawIndexed', ...args]);
        },
        end() {
          calls.push(['end']);
        },
      };
      return encoder.pass;
    },
  };
  return encoder;
}
