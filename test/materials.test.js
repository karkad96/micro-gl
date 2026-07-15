import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pipelines } from '../src/3d/core/Pipelines.js';
import { Pipelines2d } from '../src/2d/core/Pipelines2d.js';
import { TextureMaterial } from '../src/3d/materials/TextureMaterial.js';
import { SpriteMaterial2d } from '../src/2d/materials/SpriteMaterial2d.js';
import { BasicMaterial } from '../src/3d/materials/BasicMaterial.js';
import { BasicMaterial2d } from '../src/2d/materials/BasicMaterial2d.js';
import { LambertMaterial } from '../src/3d/materials/LambertMaterial.js';
import { Material } from '../src/3d/materials/Material.js';
import { Material2d } from '../src/2d/materials/Material2d.js';
import {
  BASIC_FRAGMENT_SHADER,
  LAMBERT_FRAGMENT_SHADER,
  TEXTURE_FRAGMENT_SHADER,
} from '../src/3d/shaders/fragments.js';
import {
  INSTANCED_MESH_SHADER_PREFIX,
  MESH_SHADER_PREFIX,
} from '../src/3d/shaders/vertexStages.js';
import {
  BASIC_FRAGMENT_SHADER_2D,
  SPRITE_FRAGMENT_SHADER_2D,
} from '../src/2d/shaders/fragments.js';
import {
  INSTANCED_SHAPE_SHADER_PREFIX,
  SHAPE_SHADER_PREFIX,
} from '../src/2d/shaders/vertexStages.js';
import {
  INSTANCE_VERTEX_BUFFER_LAYOUT,
  vertexBufferLayouts,
} from '../src/3d/shaders/vertexLayout.js';
import {
  INSTANCE_VERTEX_BUFFER_LAYOUT_2D,
  vertexBufferLayouts2d,
} from '../src/2d/shaders/vertexLayout.js';
import {
  INDEX_FORMAT,
  SHADER_BINDING,
  STRAIGHT_ALPHA_BLEND,
} from '../src/core/pipelineConstants.js';
import { composeShaderCode } from '../src/core/composeShaderCode.js';

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

test('shader composition is memoized without mixing up its inputs', () => {
  assert.equal(composeShaderCode('vertex;', 'fragment;'), 'vertex;fragment;');
  // Repeats hit the cache; a two-level key cannot blur the boundary
  // between prefix and fragment the way a concatenated key would.
  assert.equal(composeShaderCode('vertex;', 'fragment;'), 'vertex;fragment;');
  assert.equal(composeShaderCode('vertex;frag', 'ment;'), 'vertex;fragment;');
  assert.equal(composeShaderCode('vertex;', 'other;'), 'vertex;other;');
});

test('material shader composition follows a customized shared prefix', () => {
  const originalShared = Material.SHARED_WGSL;
  const originalInstanced = Material.INSTANCED_WGSL;
  try {
    Material.SHARED_WGSL = '// custom\n' + originalShared;
    Material.INSTANCED_WGSL = '// custom\n' + originalInstanced;
    const material = new BasicMaterial();
    assert.equal(
      material.shaderCode,
      Material.SHARED_WGSL + BASIC_FRAGMENT_SHADER,
    );
    assert.equal(
      material.instancedShaderCode,
      Material.INSTANCED_WGSL + BASIC_FRAGMENT_SHADER,
    );
  } finally {
    Material.SHARED_WGSL = originalShared;
    Material.INSTANCED_WGSL = originalInstanced;
  }
  assert.equal(
    new BasicMaterial().shaderCode,
    MESH_SHADER_PREFIX + BASIC_FRAGMENT_SHADER,
  );
});

test('3D materials compose extracted vertex and fragment shader stages', () => {
  const basic = new BasicMaterial();
  const lambert = new LambertMaterial();
  const textured = new TextureMaterial({ map: {} });

  assert.equal(basic.fragmentShader, BASIC_FRAGMENT_SHADER);
  assert.equal(lambert.fragmentShader, LAMBERT_FRAGMENT_SHADER);
  assert.equal(textured.fragmentShader, TEXTURE_FRAGMENT_SHADER);
  assert.equal(basic.shaderCode, MESH_SHADER_PREFIX + BASIC_FRAGMENT_SHADER);
  assert.equal(
    basic.instancedShaderCode,
    INSTANCED_MESH_SHADER_PREFIX + BASIC_FRAGMENT_SHADER,
  );
  assert.equal(Material.SHARED_WGSL, MESH_SHADER_PREFIX);
  assert.equal(Material.INSTANCED_WGSL, INSTANCED_MESH_SHADER_PREFIX);
});

test('2D materials compose extracted vertex and fragment shader stages', () => {
  const basic = new BasicMaterial2d();
  const sprite = new SpriteMaterial2d({ map: {} });

  assert.equal(basic.fragmentShader, BASIC_FRAGMENT_SHADER_2D);
  assert.equal(sprite.fragmentShader, SPRITE_FRAGMENT_SHADER_2D);
  assert.equal(
    basic.shaderCode,
    SHAPE_SHADER_PREFIX + BASIC_FRAGMENT_SHADER_2D,
  );
  assert.equal(
    basic.instancedShaderCode,
    INSTANCED_SHAPE_SHADER_PREFIX + BASIC_FRAGMENT_SHADER_2D,
  );
  assert.equal(Material2d.SHARED_WGSL, SHAPE_SHADER_PREFIX);
  assert.equal(Material2d.INSTANCED_WGSL, INSTANCED_SHAPE_SHADER_PREFIX);
});

test('stock fragment stages leave display encoding to the sRGB target', () => {
  for (const shader of [
    BASIC_FRAGMENT_SHADER,
    LAMBERT_FRAGMENT_SHADER,
    TEXTURE_FRAGMENT_SHADER,
    BASIC_FRAGMENT_SHADER_2D,
    SPRITE_FRAGMENT_SHADER_2D,
  ]) {
    assert.doesNotMatch(shader, /linearToSrgb/);
  }
});

test('legacy shader-prefix fields remain live customization points', () => {
  const original = {
    shared3d: Material.SHARED_WGSL,
    instanced3d: Material.INSTANCED_WGSL,
    shared2d: Material2d.SHARED_WGSL,
    instanced2d: Material2d.INSTANCED_WGSL,
  };
  try {
    Material.SHARED_WGSL = '// custom 3D vertex stage\n';
    Material.INSTANCED_WGSL = '// custom instanced 3D vertex stage\n';
    Material2d.SHARED_WGSL = '// custom 2D vertex stage\n';
    Material2d.INSTANCED_WGSL = '// custom instanced 2D vertex stage\n';

    assert.equal(
      new BasicMaterial().shaderCode,
      Material.SHARED_WGSL + BASIC_FRAGMENT_SHADER,
    );
    assert.equal(
      new BasicMaterial().instancedShaderCode,
      Material.INSTANCED_WGSL + BASIC_FRAGMENT_SHADER,
    );
    assert.equal(
      new BasicMaterial2d().shaderCode,
      Material2d.SHARED_WGSL + BASIC_FRAGMENT_SHADER_2D,
    );
    assert.equal(
      new BasicMaterial2d().instancedShaderCode,
      Material2d.INSTANCED_WGSL + BASIC_FRAGMENT_SHADER_2D,
    );
  } finally {
    Material.SHARED_WGSL = original.shared3d;
    Material.INSTANCED_WGSL = original.instanced3d;
    Material2d.SHARED_WGSL = original.shared2d;
    Material2d.INSTANCED_WGSL = original.instanced2d;
  }
});

test('texture pipeline layouts follow the shader contract, not map presence', () => {
  const captured = [];
  const pipelines = new Pipelines(capturingDevice(captured), 'bgra8unorm');
  const plainWithUnusedMap = new BasicMaterial({
    map: {},
    usesMap: false,
  });
  const textured = new TextureMaterial({ map: {} });

  const plainPipeline = pipelines.pipelineFor(plainWithUnusedMap);
  const texturedPipeline = pipelines.pipelineFor(textured);

  assert.equal(plainWithUnusedMap.usesMap, false);
  assert.equal(textured.usesMap, true);
  assert.equal(plainPipeline.descriptor.layout, pipelines.pipelineLayout);
  assert.equal(
    texturedPipeline.descriptor.layout,
    pipelines.texturedPipelineLayout,
  );
  assert.throws(() => {
    textured.usesMap = false;
  }, /read only|Cannot assign/);
});

test('legacy custom texture materials infer a stable map contract', () => {
  class LegacyTextureMaterial extends Material {
    get fragmentShader() {
      return TEXTURE_FRAGMENT_SHADER;
    }
  }

  const captured = [];
  const pipelines = new Pipelines(capturingDevice(captured), 'bgra8unorm');
  const custom = new LegacyTextureMaterial({ map: {} });
  const pipeline = pipelines.pipelineFor(custom);

  assert.equal(custom.usesMap, true);
  assert.equal(pipeline.descriptor.layout, pipelines.texturedPipelineLayout);
  assert.equal(new TextureMaterial({ map: {} }).requiresMap, true);
  assert.equal(new SpriteMaterial2d({ map: {} }).requiresMap, true);
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

/** A fake device that records every render pipeline descriptor. */
function capturingDevice(captured) {
  return {
    ...fakeDevice,
    createBindGroupLayout: (descriptor) => ({ descriptor }),
    createPipelineLayout: (descriptor) => ({ descriptor }),
    createShaderModule: () => ({}),
    createRenderPipeline: (descriptor) => {
      captured.push(descriptor);
      return { descriptor };
    },
  };
}

test('the renderer sample count is baked into every 3D pipeline, once per state', () => {
  const captured = [];
  const pipelines = new Pipelines(capturingDevice(captured), 'bgra8unorm', 4);
  const first = pipelines.pipelineFor(new BasicMaterial());
  const second = pipelines.pipelineFor(new BasicMaterial());
  assert.equal(first, second); // same composed shader + state compiles once
  assert.equal(captured.length, 1);
  assert.equal(captured[0].multisample.count, 4);
  assert.equal(captured[0].depthStencil.format, 'depth24plus');
});

test('the renderer sample count is baked into every 2D pipeline', () => {
  const captured = [];
  const pipelines = new Pipelines2d(capturingDevice(captured), 'bgra8unorm', 4);
  pipelines.pipelineFor(new BasicMaterial2d());
  assert.equal(captured[0].multisample.count, 4);
});

test('2D and 3D pipelines target their sRGB attachment format', () => {
  const captured3d = [];
  const captured2d = [];
  new Pipelines(capturingDevice(captured3d), 'bgra8unorm-srgb').pipelineFor(
    new BasicMaterial(),
  );
  new Pipelines2d(
    capturingDevice(captured2d),
    'bgra8unorm-srgb',
  ).pipelineFor(new BasicMaterial2d());

  assert.equal(
    captured3d[0].fragment.targets[0].format,
    'bgra8unorm-srgb',
  );
  assert.equal(
    captured2d[0].fragment.targets[0].format,
    'bgra8unorm-srgb',
  );
});

test('textured layouts declare uniform, texture and sampler bindings', () => {
  const pipelines = new Pipelines(capturingDevice([]), 'bgra8unorm');
  const entries = pipelines.texturedObjectBindGroupLayout.descriptor.entries;

  assert.deepEqual(
    entries.map(({ binding }) => binding),
    [
      SHADER_BINDING.uniforms,
      SHADER_BINDING.map,
      SHADER_BINDING.sampler,
    ],
  );
  assert.deepEqual(entries[0].buffer, {});
  assert.deepEqual(entries[1].texture, {});
  assert.deepEqual(entries[2].sampler, {});
});

test('3D strip and transparent state reaches the pipeline descriptor', () => {
  const captured = [];
  const pipelines = new Pipelines(capturingDevice(captured), 'bgra8unorm');
  pipelines.pipelineFor(
    new BasicMaterial({
      topology: 'triangle-strip',
      transparent: true,
    }),
  );

  const [descriptor] = captured;
  assert.equal(descriptor.primitive.stripIndexFormat, INDEX_FORMAT);
  assert.equal(descriptor.depthStencil.depthWriteEnabled, false);
  assert.equal(
    descriptor.fragment.targets[0].blend,
    STRAIGHT_ALPHA_BLEND,
  );
});

test('2D strip and blend state reaches the pipeline descriptor', () => {
  const captured = [];
  const pipelines = new Pipelines2d(
    capturingDevice(captured),
    'bgra8unorm',
  );
  pipelines.pipelineFor(
    new BasicMaterial2d({ topology: 'line-strip' }),
  );

  const [descriptor] = captured;
  assert.equal(descriptor.primitive.stripIndexFormat, INDEX_FORMAT);
  assert.equal(
    descriptor.fragment.targets[0].blend,
    STRAIGHT_ALPHA_BLEND,
  );
});

test('pipeline caches distinguish shader variants from the same material class', () => {
  class VariantMaterial extends BasicMaterial {
    constructor(variant) {
      super();
      this.variant = variant;
    }

    get fragmentShader() {
      return `${super.fragmentShader}\n// variant: ${this.variant}`;
    }
  }

  const captured = [];
  const pipelines = new Pipelines(capturingDevice(captured), 'bgra8unorm');
  const first = pipelines.pipelineFor(new VariantMaterial('first'));
  const second = pipelines.pipelineFor(new VariantMaterial('second'));
  const firstAgain = pipelines.pipelineFor(new VariantMaterial('first'));

  assert.notEqual(first, second);
  assert.equal(first, firstAgain);
  assert.equal(captured.length, 2);
});

test('2D pipeline caches also distinguish per-instance shader variants', () => {
  class VariantMaterial2d extends BasicMaterial2d {
    constructor(variant) {
      super();
      this.variant = variant;
    }

    get fragmentShader() {
      return `${super.fragmentShader}\n// variant: ${this.variant}`;
    }
  }

  const captured = [];
  const pipelines = new Pipelines2d(capturingDevice(captured), 'bgra8unorm');
  const first = pipelines.pipelineFor(new VariantMaterial2d('first'));
  const second = pipelines.pipelineFor(new VariantMaterial2d('second'));

  assert.notEqual(first, second);
  assert.equal(captured.length, 2);
});

test('instanced pipelines use the vertex layouts shared with their shaders', () => {
  const captured3d = [];
  const pipelines3d = new Pipelines(capturingDevice(captured3d), 'bgra8unorm');
  pipelines3d.pipelineFor(new BasicMaterial(), true);
  assert.equal(captured3d[0].vertex.buffers, vertexBufferLayouts(true));
  assert.equal(captured3d[0].vertex.buffers[1], INSTANCE_VERTEX_BUFFER_LAYOUT);

  const captured2d = [];
  const pipelines2d = new Pipelines2d(
    capturingDevice(captured2d),
    'bgra8unorm',
  );
  pipelines2d.pipelineFor(new BasicMaterial2d(), true);
  assert.equal(captured2d[0].vertex.buffers, vertexBufferLayouts2d(true));
  assert.equal(
    captured2d[0].vertex.buffers[1],
    INSTANCE_VERTEX_BUFFER_LAYOUT_2D,
  );
});
