import { uploadTexture } from '../../core/uploadTexture.js';
import { SINGLE_SAMPLE_COUNT } from '../../core/rendererConfig.js';
import { SHADER_BINDING } from '../../core/pipelineConstants.js';
import { materialUsesMap } from '../../core/materialResources.js';
import {
  disposeOwnedObjectGpuResources,
  trackObjectGpuResource,
} from '../../core/objectGpuResources.js';
import { Pipelines2d } from './Pipelines2d.js';
import { OBJECT_UNIFORM_SIZE_2D } from './Uniforms2d.js';

export { OBJECT_UNIFORM_SIZE_2D } from './Uniforms2d.js';

/**
 * Owns the GPU resources Renderer2d creates on behalf of geometries,
 * materials and shapes — the 2D counterpart of GpuResources, with the
 * same lazy caching scheme:
 *
 *   - vertex + index buffers per geometry
 *   - a GPU texture + sampler per Texture
 *   - a small uniform buffer + bind group per shape
 *
 * Everything is created lazily on first use. Geometry and texture
 * resources are cached per GPUDevice; shape resources are cached per
 * GpuResources2d instance because their bind groups use this instance's
 * layouts. Render pipelines and their shared layouts live in Pipelines2d.
 */
export class GpuResources2d {
  constructor(device, format, sampleCount = SINGLE_SAMPLE_COUNT) {
    this.device = device;
    this.pipelines = new Pipelines2d(device, format, sampleCount);
    this._objectGpuResourceRefs = new Set();
    // Renderer2d builds its per-frame bind group against this layout.
    this.frameBindGroupLayout = this.pipelines.frameBindGroupLayout;
  }

  /** The render pipeline for a material + pipeline state — see Pipelines2d. */
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
        label: 'Geometry vertices',
        size: geometry.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices);

      const indexBuffer = this.device.createBuffer({
        label: 'Geometry indices',
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
   * Uniform buffer, bind group and staging array for a shape. The bind
   * group is rebuilt automatically whenever the material's `map`
   * changes (a swapped material, a swapped texture, or a Texture
   * re-uploaded after `dispose()`).
   */
  shapeFor(shape) {
    const cache = shape._gpu || (shape._gpu = new Map());
    let gpu = cache.get(this);
    if (!gpu) {
      gpu = {
        uniformBuffer: this.device.createBuffer({
          label: 'Shape uniforms',
          size: OBJECT_UNIFORM_SIZE_2D,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
        bindGroup: null,
        mapGpu: null, // the uploaded texture the bind group samples
        data: new Float32Array(
          OBJECT_UNIFORM_SIZE_2D / Float32Array.BYTES_PER_ELEMENT,
        ),
      };
      if (shape.isInstanced) {
        gpu.instanceBuffer = this.device.createBuffer({
          label: 'Shape instance data',
          size: shape.instanceData.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        gpu.instanceRevision = null; // this fresh buffer has no data yet
      }
      cache.set(this, gpu);
      trackObjectGpuResource(this, shape, gpu);
    }

    if (
      shape.isInstanced &&
      (shape.needsUpdate ||
        gpu.instanceRevision !== shape._instanceRevision)
    ) {
      this.device.queue.writeBuffer(
        gpu.instanceBuffer,
        0,
        shape.instanceData,
      );
      gpu.instanceRevision = shape._instanceRevision;
      shape.needsUpdate = false;
    }

    const mapGpu = materialUsesMap(shape.material)
      ? this.textureFor(shape.material.map)
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
      gpu.bindGroup = this.device.createBindGroup({
        label: mapGpu ? 'Textured shape uniforms' : 'Shape uniforms',
        layout,
        entries,
      });
      gpu.mapGpu = mapGpu;
    }
    return gpu;
  }

  /** Releases this manager's per-object buffers and cache entries. */
  dispose() {
    disposeOwnedObjectGpuResources(this);
  }
}
