import { uploadTexture } from '../../core/uploadTexture.js';
import { SINGLE_SAMPLE_COUNT } from '../../core/rendererConfig.js';
import { SHADER_BINDING } from '../../core/pipelineConstants.js';
import { materialUsesMap } from '../../core/materialResources.js';
import {
  disposeOwnedObjectGpuResources,
  trackObjectGpuResource,
} from '../../core/objectGpuResources.js';
import { Pipelines } from './Pipelines.js';
import { OBJECT_UNIFORM_SIZE } from './Uniforms.js';

export { OBJECT_UNIFORM_SIZE } from './Uniforms.js';

/**
 * Owns the GPU resources the renderer creates on behalf of geometries,
 * materials and meshes, so scene objects stay plain data:
 *
 *   - vertex + index buffers per geometry
 *   - a GPU texture + sampler per Texture
 *   - a small uniform buffer + bind group per mesh
 *
 * Everything is created lazily on first use. Geometry and texture
 * resources are cached per GPUDevice; mesh resources are cached per
 * GpuResources instance because their bind groups use this instance's
 * layouts. Render pipelines and their shared layouts live in Pipelines.
 */
export class GpuResources {
  constructor(device, format, sampleCount = SINGLE_SAMPLE_COUNT) {
    this.device = device;
    this.pipelines = new Pipelines(device, format, sampleCount);
    this._objectGpuResourceRefs = new Set();
    // The renderer builds its per-frame bind group against this layout.
    this.frameBindGroupLayout = this.pipelines.frameBindGroupLayout;
  }

  /** The render pipeline for a material + pipeline state — see Pipelines. */
  pipelineFor(material, instanced = false) {
    return this.pipelines.pipelineFor(material, instanced);
  }

  /** GPU texture, view and sampler for a Texture, uploaded on first use. */
  textureFor(texture) {
    return uploadTexture(this.device, texture);
  }

  /**
   * Vertex and index buffers for a geometry, re-uploaded when its
   * `needsUpdate` flag is set.
   */
  geometryFor(geometry) {
    const cache = geometry._gpu || (geometry._gpu = new Map());
    let gpu = cache.get(this.device);

    if (!gpu) {
      const vertexBuffer = this.device.createBuffer({
        size: geometry.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices);

      const indexBuffer = this.device.createBuffer({
        size: geometry.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(indexBuffer, 0, geometry.indices);

      gpu = {
        vertexBuffer,
        indexBuffer,
        revision: geometry._gpuRevision,
      };
      cache.set(this.device, gpu);
    } else if (
      geometry.needsUpdate ||
      gpu.revision !== geometry._gpuRevision
    ) {
      this.device.queue.writeBuffer(gpu.vertexBuffer, 0, geometry.vertices);
      this.device.queue.writeBuffer(gpu.indexBuffer, 0, geometry.indices);
      gpu.revision = geometry._gpuRevision;
    }

    // Revisions keep the other devices' caches stale until each is drawn,
    // so clearing this public hint here cannot make them miss an update.
    geometry.needsUpdate = false;
    return gpu;
  }

  /**
   * Uniform buffer, bind group and staging array for a mesh. The bind
   * group is rebuilt automatically whenever the material's `map`
   * changes (a swapped material, a swapped texture, or a Texture
   * re-uploaded after `dispose()`).
   */
  meshFor(mesh) {
    const cache = mesh._gpu || (mesh._gpu = new Map());
    let gpu = cache.get(this);
    if (!gpu) {
      gpu = {
        uniformBuffer: this.device.createBuffer({
          size: OBJECT_UNIFORM_SIZE,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
        bindGroup: null,
        mapGpu: null, // the uploaded texture the bind group samples
        data: new Float32Array(
          OBJECT_UNIFORM_SIZE / Float32Array.BYTES_PER_ELEMENT,
        ),
      };
      if (mesh.isInstanced) {
        gpu.instanceBuffer = this.device.createBuffer({
          size: mesh.instanceData.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        gpu.instanceRevision = null; // this fresh buffer has no data yet
      }
      cache.set(this, gpu);
      trackObjectGpuResource(this, mesh, gpu);
    }

    if (
      mesh.isInstanced &&
      (mesh.needsUpdate ||
        gpu.instanceRevision !== mesh._instanceRevision)
    ) {
      this.device.queue.writeBuffer(
        gpu.instanceBuffer,
        0,
        mesh.instanceData,
      );
      gpu.instanceRevision = mesh._instanceRevision;
      mesh.needsUpdate = false;
    }

    const mapGpu = materialUsesMap(mesh.material)
      ? this.textureFor(mesh.material.map)
      : null;
    if (!gpu.bindGroup || gpu.mapGpu !== mapGpu) {
      let layout = this.pipelines.objectBindGroupLayout;
      const entries = [
        {
          binding: SHADER_BINDING.uniforms,
          resource: { buffer: gpu.uniformBuffer },
        },
      ];
      if (mapGpu) {
        layout = this.pipelines.texturedObjectBindGroupLayout;
        entries.push(
          { binding: SHADER_BINDING.map, resource: mapGpu.view },
          { binding: SHADER_BINDING.sampler, resource: mapGpu.sampler },
        );
      }
      gpu.bindGroup = this.device.createBindGroup({ layout, entries });
      gpu.mapGpu = mapGpu;
    }
    return gpu;
  }

  /** Releases this manager's per-object buffers and cache entries. */
  dispose() {
    disposeOwnedObjectGpuResources(this);
  }
}
