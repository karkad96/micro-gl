import { uploadTexture } from '../../core/uploadTexture.js';
import { Pipelines } from './Pipelines.js';

// ObjectUniforms: two mat4x4f (128) + vec4f (16) = 144 bytes,
// matching the WGSL struct in Material.js.
export const OBJECT_UNIFORM_SIZE = 144;

/**
 * Owns the GPU resources the renderer creates on behalf of geometries,
 * materials and meshes, so scene objects stay plain data:
 *
 *   - vertex + index buffers per geometry
 *   - a GPU texture + sampler per Texture
 *   - a small uniform buffer + bind group per mesh
 *
 * Everything is created lazily on first use and cached on the object
 * (`_gpu`). Render pipelines and the bind group layouts they share
 * live in Pipelines; `pipelineFor` and `frameBindGroupLayout` are
 * forwarded from there.
 */
export class GpuResources {
  constructor(device, format) {
    this.device = device;
    this.pipelines = new Pipelines(device, format);
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

  /** Vertex and index buffers for a geometry. */
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
    }
    return geometry._gpu;
  }

  /**
   * Uniform buffer, bind group and staging array for a mesh. The bind
   * group is rebuilt automatically whenever the material's `map`
   * changes (a swapped material, a swapped texture, or a Texture
   * re-uploaded after `dispose()`).
   */
  meshFor(mesh) {
    let gpu = mesh._gpu;
    if (!gpu) {
      gpu = mesh._gpu = {
        uniformBuffer: this.device.createBuffer({
          size: OBJECT_UNIFORM_SIZE,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
        bindGroup: null,
        mapGpu: null, // the uploaded texture the bind group samples
        data: new Float32Array(OBJECT_UNIFORM_SIZE / 4),
      };
      if (mesh.isInstanced) {
        gpu.instanceBuffer = this.device.createBuffer({
          size: mesh.instanceData.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
    }

    const mapGpu = mesh.material.map
      ? this.textureFor(mesh.material.map)
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
