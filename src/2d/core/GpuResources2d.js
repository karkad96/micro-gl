import { uploadTexture } from '../../core/uploadTexture.js';
import { Pipelines2d } from './Pipelines2d.js';

// ObjectUniforms: mat3x3f (48, each column padded to 16 bytes) + vec4f (16)
// = 64 bytes, matching the WGSL struct in Material2d.js.
export const OBJECT_UNIFORM_SIZE_2D = 64;

/**
 * Owns the GPU resources Renderer2d creates on behalf of geometries,
 * materials and shapes — the 2D counterpart of GpuResources, with the
 * same lazy caching scheme:
 *
 *   - vertex + index buffers per geometry
 *   - a GPU texture + sampler per Texture
 *   - a small uniform buffer + bind group per shape
 *
 * Everything is created lazily on first use and cached on the object
 * (`_gpu`). Render pipelines and the bind group layouts they share
 * live in Pipelines2d; `pipelineFor` and `frameBindGroupLayout` are
 * forwarded from there.
 */
export class GpuResources2d {
  constructor(device, format, sampleCount = 1) {
    this.device = device;
    this.pipelines = new Pipelines2d(device, format, sampleCount);
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
    if (!geometry._gpu) {
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

      geometry._gpu = { vertexBuffer, indexBuffer };
      geometry.needsUpdate = false;
    } else if (geometry.needsUpdate) {
      this.device.queue.writeBuffer(
        geometry._gpu.vertexBuffer,
        0,
        geometry.vertices,
      );
      this.device.queue.writeBuffer(
        geometry._gpu.indexBuffer,
        0,
        geometry.indices,
      );
      geometry.needsUpdate = false;
    }
    return geometry._gpu;
  }

  /**
   * Uniform buffer, bind group and staging array for a shape. The bind
   * group is rebuilt automatically whenever the material's `map`
   * changes (a swapped material, a swapped texture, or a Texture
   * re-uploaded after `dispose()`).
   */
  shapeFor(shape) {
    let gpu = shape._gpu;
    if (!gpu) {
      gpu = shape._gpu = {
        uniformBuffer: this.device.createBuffer({
          size: OBJECT_UNIFORM_SIZE_2D,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
        bindGroup: null,
        mapGpu: null, // the uploaded texture the bind group samples
        data: new Float32Array(OBJECT_UNIFORM_SIZE_2D / 4),
      };
      if (shape.isInstanced) {
        gpu.instanceBuffer = this.device.createBuffer({
          size: shape.instanceData.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
    }

    const mapGpu = shape.material.map
      ? this.textureFor(shape.material.map)
      : null;
    if (!gpu.bindGroup || gpu.mapGpu !== mapGpu) {
      let layout = this.pipelines.objectBindGroupLayout;
      const entries = [{ binding: 0, resource: { buffer: gpu.uniformBuffer } }];
      if (mapGpu) {
        layout = this.pipelines.texturedObjectBindGroupLayout;
        entries.push(
          { binding: 1, resource: mapGpu.view },
          { binding: 2, resource: mapGpu.sampler },
        );
      }
      gpu.bindGroup = this.device.createBindGroup({ layout, entries });
      gpu.mapGpu = mapGpu;
    }
    return gpu;
  }
}
