import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GpuResources } from '../src/3d/core/GpuResources.js';
import { GpuResources2d } from '../src/2d/core/GpuResources2d.js';
import {
  InstancedMesh,
  INSTANCE_SIZE,
} from '../src/3d/core/InstancedMesh.js';
import {
  InstancedShape2d,
  INSTANCE_SIZE_2D,
} from '../src/2d/core/InstancedShape2d.js';
import { Geometry } from '../src/3d/geometries/Geometry.js';
import { Geometry2d } from '../src/2d/geometries/Geometry2d.js';
import { Texture } from '../src/core/Texture.js';
import { uploadTexture } from '../src/core/uploadTexture.js';

// Node does not expose WebGPU constants. These values only need distinct bits
// because the fake device records descriptors instead of using them.
globalThis.GPUBufferUsage ??= {
  COPY_DST: 1,
  INDEX: 2,
  UNIFORM: 4,
  VERTEX: 8,
};
globalThis.GPUTextureUsage ??= {
  COPY_DST: 1,
  RENDER_ATTACHMENT: 2,
  TEXTURE_BINDING: 4,
};

function fakeDevice(name) {
  let nextBufferId = 0;
  const device = {
    name,
    buffers: [],
    textures: [],
    writes: [],
    copies: [],
    queue: {
      writeBuffer(buffer, offset, data) {
        device.writes.push({ buffer, offset, data: Array.from(data) });
      },
      copyExternalImageToTexture(source, destination, size) {
        device.copies.push({ source, destination, size });
      },
    },
    createBuffer(descriptor) {
      const buffer = {
        descriptor,
        device,
        id: `${name}-buffer-${nextBufferId++}`,
        destroyed: false,
        destroy() {
          this.destroyed = true;
        },
      };
      device.buffers.push(buffer);
      return buffer;
    },
    createTexture(descriptor) {
      const texture = {
        descriptor,
        device,
        destroyed: false,
        createView() {
          return { texture: this };
        },
        destroy() {
          this.destroyed = true;
        },
      };
      device.textures.push(texture);
      return texture;
    },
    createSampler(descriptor) {
      return { descriptor, device };
    },
    createBindGroup(descriptor) {
      return { descriptor, device };
    },
  };
  return device;
}

function resourcesFor(ResourceClass, device) {
  const resources = Object.create(ResourceClass.prototype);
  resources.device = device;
  resources.pipelines = {
    objectBindGroupLayout: { resources, type: 'plain' },
    texturedObjectBindGroupLayout: { resources, type: 'textured' },
  };
  resources._objectGpuResourceRefs = new Set();
  return resources;
}

function objectGpuFor(resources, object) {
  return typeof resources.meshFor === 'function'
    ? resources.meshFor(object)
    : resources.shapeFor(object);
}

const geometryCases = [
  {
    label: '3D',
    GeometryClass: Geometry,
    ResourceClass: GpuResources,
    vertices: [0, 0, 0, 0, 0, 1, 0, 0],
  },
  {
    label: '2D',
    GeometryClass: Geometry2d,
    ResourceClass: GpuResources2d,
    vertices: [0, 0, 0, 0],
  },
];

for (const {
  label,
  GeometryClass,
  ResourceClass,
  vertices,
} of geometryCases) {
  test(`${label} geometry buffers are cached and updated per device`, () => {
    const deviceA = fakeDevice('A');
    const deviceB = fakeDevice('B');
    const resourcesA = resourcesFor(ResourceClass, deviceA);
    const secondResourcesA = resourcesFor(ResourceClass, deviceA);
    const resourcesB = resourcesFor(ResourceClass, deviceB);
    const geometry = new GeometryClass(vertices, [0]);

    const gpuA = resourcesA.geometryFor(geometry);
    assert.equal(secondResourcesA.geometryFor(geometry), gpuA);
    const gpuB = resourcesB.geometryFor(geometry);

    assert.notEqual(gpuA, gpuB);
    assert.equal(geometry._gpu.size, 2);
    assert.equal(deviceA.writes.length, 2);
    assert.equal(deviceB.writes.length, 2);

    geometry.vertices[0] = 7;
    geometry.needsUpdate = true;
    resourcesA.geometryFor(geometry);
    assert.equal(geometry.needsUpdate, false);
    resourcesB.geometryFor(geometry);

    assert.equal(deviceA.writes.length, 4);
    assert.equal(deviceB.writes.length, 4);
    assert.equal(deviceA.writes.at(-2).data[0], 7);
    assert.equal(deviceB.writes.at(-2).data[0], 7);

    geometry.dispose();
    assert.equal(geometry._gpu, null);
    assert.ok(deviceA.buffers.every((buffer) => buffer.destroyed));
    assert.ok(deviceB.buffers.every((buffer) => buffer.destroyed));
  });
}

test('textures are uploaded, cached and disposed per device', () => {
  const deviceA = fakeDevice('A');
  const deviceB = fakeDevice('B');
  const texture = new Texture(
    { width: 2, height: 2 },
    { mipmaps: false },
  );

  const gpuA = uploadTexture(deviceA, texture);
  assert.equal(uploadTexture(deviceA, texture), gpuA);
  const gpuB = uploadTexture(deviceB, texture);

  assert.notEqual(gpuA, gpuB);
  assert.equal(texture._gpu.size, 2);
  assert.equal(deviceA.copies.length, 1);
  assert.equal(deviceB.copies.length, 1);

  texture.dispose();
  assert.equal(texture._gpu, null);
  assert.equal(gpuA.texture.destroyed, true);
  assert.equal(gpuB.texture.destroyed, true);

  const reuploaded = uploadTexture(deviceA, texture);
  assert.notEqual(reuploaded, gpuA);
  assert.equal(deviceA.copies.length, 2);
});

const instanceCases = [
  {
    label: 'InstancedMesh',
    instanceSize: INSTANCE_SIZE,
    ResourceClass: GpuResources,
    create(capacity = 1) {
      return new InstancedMesh(
        new Geometry([0, 0, 0, 0, 0, 1, 0, 0], [0]),
        { map: null },
        capacity,
      );
    },
  },
  {
    label: 'InstancedShape2d',
    instanceSize: INSTANCE_SIZE_2D,
    ResourceClass: GpuResources2d,
    create(capacity = 1) {
      return new InstancedShape2d(
        new Geometry2d([0, 0, 0, 0], [0]),
        { map: null },
        capacity,
      );
    },
  },
];

for (const {
  label,
  instanceSize,
  ResourceClass,
  create,
} of instanceCases) {
  test(`${label} resources are manager-local and fresh buffers upload`, () => {
    const device = fakeDevice('shared');
    const resourcesA = resourcesFor(ResourceClass, device);
    const resourcesB = resourcesFor(ResourceClass, device);
    const object = create();

    const gpuA = objectGpuFor(resourcesA, object);
    const gpuB = objectGpuFor(resourcesB, object);

    assert.notEqual(gpuA, gpuB);
    assert.notEqual(gpuA.uniformBuffer, gpuB.uniformBuffer);
    assert.notEqual(gpuA.bindGroup, gpuB.bindGroup);
    assert.equal(object._gpu.size, 2);
    assert.equal(object.needsUpdate, false);
    assert.equal(
      device.writes.filter(({ buffer }) => buffer === gpuA.instanceBuffer)
        .length,
      1,
    );
    assert.equal(
      device.writes.filter(({ buffer }) => buffer === gpuB.instanceBuffer)
        .length,
      1,
    );

    object.instanceData[0] = 2;
    object.needsUpdate = true;
    objectGpuFor(resourcesA, object);
    assert.equal(object.needsUpdate, false);
    objectGpuFor(resourcesB, object);
    assert.equal(
      device.writes.filter(({ buffer }) => buffer === gpuA.instanceBuffer)
        .length,
      2,
    );
    assert.equal(
      device.writes.filter(({ buffer }) => buffer === gpuB.instanceBuffer)
        .length,
      2,
    );

    object.dispose();
    assert.equal(object._gpu, null);
    assert.equal(object.needsUpdate, true);
    assert.equal(gpuA.uniformBuffer.destroyed, true);
    assert.equal(gpuA.instanceBuffer.destroyed, true);
    assert.equal(gpuB.uniformBuffer.destroyed, true);
    assert.equal(gpuB.instanceBuffer.destroyed, true);

    const recreated = objectGpuFor(resourcesA, object);
    assert.notEqual(recreated.instanceBuffer, gpuA.instanceBuffer);
    assert.equal(
      device.writes.filter(
        ({ buffer }) => buffer === recreated.instanceBuffer,
      ).length,
      1,
    );
  });

  test(`${label} manager disposal removes only its own cache entry`, () => {
    const device = fakeDevice('shared');
    const resourcesA = resourcesFor(ResourceClass, device);
    const resourcesB = resourcesFor(ResourceClass, device);
    const object = create();
    const gpuA = objectGpuFor(resourcesA, object);
    const gpuB = objectGpuFor(resourcesB, object);

    resourcesA.dispose();

    assert.equal(gpuA.uniformBuffer.destroyed, true);
    assert.equal(gpuA.instanceBuffer.destroyed, true);
    assert.equal(gpuB.uniformBuffer.destroyed, false);
    assert.equal(gpuB.instanceBuffer.destroyed, false);
    assert.equal(object._gpu.has(resourcesA), false);
    assert.equal(object._gpu.get(resourcesB), gpuB);
    assert.equal(resourcesA._objectGpuResourceRefs.size, 0);
    assert.equal(resourcesB._objectGpuResourceRefs.size, 1);
  });

  test(`${label} GPU allocation stays at fixed capacity`, () => {
    const device = fakeDevice(label);
    const resources = resourcesFor(ResourceClass, device);
    const object = create(3);
    object.count = 1;

    const gpu = objectGpuFor(resources, object);
    assert.equal(
      gpu.instanceBuffer.descriptor.size,
      3 * instanceSize * Float32Array.BYTES_PER_ELEMENT,
    );

    object.count = object.capacity;
    const reused = objectGpuFor(resources, object);
    assert.equal(reused.instanceBuffer, gpu.instanceBuffer);
    assert.equal(
      device.writes.filter(
        ({ buffer }) => buffer === gpu.instanceBuffer,
      ).length,
      1,
    );
  });
}

const materialResourceCases = [
  {
    label: '3D',
    ResourceClass: GpuResources,
    resourceMethod: 'meshFor',
  },
  {
    label: '2D',
    ResourceClass: GpuResources2d,
    resourceMethod: 'shapeFor',
  },
];

for (const { label, ResourceClass, resourceMethod } of materialResourceCases) {
  test(`${label} bind groups follow usesMap instead of map presence`, () => {
    const device = fakeDevice(label);
    const resources = resourcesFor(ResourceClass, device);
    const texture = new Texture(
      { width: 1, height: 1 },
      { mipmaps: false },
    );
    const object = {
      _gpu: null,
      isInstanced: false,
      material: { map: texture, usesMap: false },
    };

    const plain = resources[resourceMethod](object);
    assert.equal(
      plain.bindGroup.descriptor.layout.type,
      'plain',
    );
    assert.equal(device.textures.length, 0);

    object.dispose?.();
    object._gpu = null;
    object.material = { map: texture, usesMap: true };
    const textured = resources[resourceMethod](object);
    assert.equal(
      textured.bindGroup.descriptor.layout.type,
      'textured',
    );
    assert.equal(device.textures.length, 1);

    object._gpu = null;
    object.material = { map: null, usesMap: true };
    assert.throws(
      () => resources[resourceMethod](object),
      /map.*was cleared/,
    );
  });
}
