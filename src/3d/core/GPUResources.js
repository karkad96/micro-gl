import { VERTEX_STRIDE } from '../geometries/Geometry.js';

// ObjectUniforms: two mat4x4f (128) + vec4f (16) = 144 bytes,
// matching the WGSL struct in Material.js.
export const OBJECT_UNIFORM_SIZE = 144;

/**
 * Owns the GPU resources the renderer creates on behalf of geometries,
 * materials and meshes, so scene objects stay plain data:
 *
 *   - the bind group layouts / pipeline layout shared by all pipelines
 *   - one render pipeline per material class
 *   - vertex + index buffers per geometry
 *   - a small uniform buffer + bind group per mesh
 *
 * Everything is created lazily on first use and cached on the object
 * (`_gpu`) or in a map keyed by material class.
 */
export class GPUResources {
  constructor(device, format) {
    this.device = device;
    this.format = format;
    this._pipelines = new Map(); // material class -> GPURenderPipeline

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

  /** Uniform buffer, bind group and staging array for a mesh. */
  meshFor(mesh) {
    if (!mesh._gpu) {
      const uniformBuffer = this.device.createBuffer({
        size: OBJECT_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = this.device.createBindGroup({
        layout: this.objectBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });
      mesh._gpu = {
        uniformBuffer,
        bindGroup,
        data: new Float32Array(OBJECT_UNIFORM_SIZE / 4),
      };
    }
    return mesh._gpu;
  }

  /** The render pipeline for a material's class (compiled once, shared). */
  pipelineFor(material) {
    const key = material.constructor;
    let pipeline = this._pipelines.get(key);
    if (!pipeline) {
      const module = this.device.createShaderModule({
        code: material.shaderCode,
      });
      pipeline = this.device.createRenderPipeline({
        layout: this.pipelineLayout,
        vertex: {
          module,
          entryPoint: 'vs',
          buffers: [
            {
              arrayStride: VERTEX_STRIDE,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
                { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
                { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{ format: this.format }],
        },
        primitive: {
          topology: 'triangle-list',
          cullMode: 'back',
          frontFace: 'ccw',
        },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
      });
      this._pipelines.set(key, pipeline);
    }
    return pipeline;
  }
}
