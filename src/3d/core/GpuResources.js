import { VERTEX_STRIDE } from '../geometries/Geometry.js';
import {
  generateMipmaps,
  mipLevelCount,
} from '../../core/generateMipmaps.js';

// ObjectUniforms: two mat4x4f (128) + vec4f (16) = 144 bytes,
// matching the WGSL struct in Material.js.
export const OBJECT_UNIFORM_SIZE = 144;

/**
 * Owns the GPU resources the renderer creates on behalf of geometries,
 * materials and meshes, so scene objects stay plain data:
 *
 *   - the bind group layouts / pipeline layouts shared by all pipelines
 *   - one render pipeline per material class + pipeline state
 *     (topology, cull mode, front face, textured or not)
 *   - vertex + index buffers per geometry
 *   - a GPU texture + sampler per Texture
 *   - a small uniform buffer + bind group per mesh
 *
 * Everything is created lazily on first use and cached on the object
 * (`_gpu`) or in a map keyed by material class.
 */
export class GpuResources {
  constructor(device, format) {
    this.device = device;
    this.format = format;
    // material class -> Map of pipeline-state key -> GPURenderPipeline
    this._pipelines = new Map();

    // Bind group 0: per-frame uniforms (camera + lights).
    this.frameBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {},
        },
      ],
    });
    // Bind group 1: per-object uniforms (transforms + color).
    this.objectBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {},
        },
      ],
    });
    this.pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.frameBindGroupLayout, this.objectBindGroupLayout],
    });

    // Bind group 1 for materials with a `map`: the uniforms plus the
    // texture and its sampler.
    this.texturedObjectBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {},
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.texturedPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [
        this.frameBindGroupLayout,
        this.texturedObjectBindGroupLayout,
      ],
    });
  }

  /** GPU texture, view and sampler for a Texture, uploaded on first use. */
  textureFor(texture) {
    if (!texture._gpu) {
      const size = [texture.width, texture.height];
      const levels = texture.mipmaps
        ? mipLevelCount(texture.width, texture.height)
        : 1;
      const gpuTexture = this.device.createTexture({
        size,
        mipLevelCount: levels,
        format: 'rgba8unorm',
        // copyExternalImageToTexture requires RENDER_ATTACHMENT usage.
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture(
        { source: texture.source, flipY: texture.flipY },
        { texture: gpuTexture },
        size,
      );
      if (levels > 1) generateMipmaps(this.device, gpuTexture, levels);
      const sampler = this.device.createSampler({
        magFilter: texture.magFilter,
        minFilter: texture.minFilter,
        mipmapFilter: texture.mipmaps ? 'linear' : 'nearest',
        addressModeU: texture.addressModeU,
        addressModeV: texture.addressModeV,
      });
      texture._gpu = {
        texture: gpuTexture,
        view: gpuTexture.createView(),
        sampler,
      };
    }
    return texture._gpu;
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
   * group is built for the material the mesh has on first draw — after
   * swapping in a material with a different `map`, call
   * `mesh.dispose()` so it is rebuilt.
   */
  meshFor(mesh) {
    if (!mesh._gpu) {
      const uniformBuffer = this.device.createBuffer({
        size: OBJECT_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      let layout = this.objectBindGroupLayout;
      const entries = [{ binding: 0, resource: { buffer: uniformBuffer } }];
      if (mesh.material.map) {
        const texture = this.textureFor(mesh.material.map);
        layout = this.texturedObjectBindGroupLayout;
        entries.push(
          { binding: 1, resource: texture.view },
          { binding: 2, resource: texture.sampler },
        );
      }
      const bindGroup = this.device.createBindGroup({
        layout,
        entries,
      });
      mesh._gpu = {
        uniformBuffer,
        bindGroup,
        data: new Float32Array(OBJECT_UNIFORM_SIZE / 4),
      };
      if (mesh.isInstanced) {
        mesh._gpu.instanceBuffer = this.device.createBuffer({
          size: mesh.instanceData.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
    }
    return mesh._gpu;
  }

  /**
   * The render pipeline for a material's class and pipeline state
   * (topology, cull mode, front face, textured or not, instanced or
   * not). Compiled once per combination and shared by every material
   * instance that matches.
   */
  pipelineFor(material, instanced = false) {
    const { topology, cullMode, frontFace } = material;
    let variants = this._pipelines.get(material.constructor);
    if (!variants) {
      variants = new Map();
      this._pipelines.set(material.constructor, variants);
    }
    const textured = !!material.map;
    const stateKey = `${topology}|${cullMode}|${frontFace}|${textured}|${instanced}`;
    let pipeline = variants.get(stateKey);
    if (!pipeline) {
      const primitive = { topology, cullMode, frontFace };
      // Indexed draws on strip topologies must declare the index format
      // up front; the renderer always uses uint32 indices.
      if (topology === 'triangle-strip' || topology === 'line-strip') {
        primitive.stripIndexFormat = 'uint32';
      }
      const buffers = [
        {
          arrayStride: VERTEX_STRIDE,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
            { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
          ],
        },
      ];
      if (instanced) {
        // Per-instance data, matching InstancedMesh.instanceData:
        // a mat4 as four vec4 columns, then an rgba color.
        buffers.push({
          arrayStride: 80,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 3, offset: 0, format: 'float32x4' },
            { shaderLocation: 4, offset: 16, format: 'float32x4' },
            { shaderLocation: 5, offset: 32, format: 'float32x4' },
            { shaderLocation: 6, offset: 48, format: 'float32x4' },
            { shaderLocation: 7, offset: 64, format: 'float32x4' }, // color
          ],
        });
      }
      const module = this.device.createShaderModule({
        code: instanced ? material.instancedShaderCode : material.shaderCode,
      });
      pipeline = this.device.createRenderPipeline({
        layout: textured ? this.texturedPipelineLayout : this.pipelineLayout,
        vertex: {
          module,
          entryPoint: 'vs',
          buffers,
        },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{ format: this.format }],
        },
        primitive,
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
      });
      variants.set(stateKey, pipeline);
    }
    return pipeline;
  }
}
