import { VERTEX_STRIDE_2D } from '../geometries/Geometry2D.js';

// ObjectUniforms: mat3x3f (48, each column padded to 16 bytes) + vec4f (16)
// = 64 bytes, matching the WGSL struct in Material2D.js.
export const OBJECT_UNIFORM_SIZE_2D = 64;

/**
 * Owns the GPU resources Renderer2D creates on behalf of geometries,
 * materials and shapes — the 2D counterpart of GPUResources, with the
 * same lazy caching scheme.
 *
 * The pipelines differ from the 3D ones where 2D differs from 3D:
 *   - alpha blending is enabled (shapes draw back-to-front, so
 *     transparency just works — no depth buffer involved)
 *   - no depth/stencil state (the 2D render pass has no depth attachment)
 *   - no culling: a negative scale flips a shape's winding and it should
 *     still be visible
 */
export class GPUResources2D {
  constructor(device, format) {
    this.device = device;
    this.format = format;
    this._pipelines = new Map(); // material class -> GPURenderPipeline

    // Bind group 0: per-frame uniforms (the camera matrix).
    this.frameBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {},
        },
      ],
    });
    // Bind group 1: per-object uniforms (transform + color).
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

  /** Uniform buffer, bind group and staging array for a shape. */
  shapeFor(shape) {
    if (!shape._gpu) {
      const uniformBuffer = this.device.createBuffer({
        size: OBJECT_UNIFORM_SIZE_2D,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = this.device.createBindGroup({
        layout: this.objectBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });
      shape._gpu = {
        uniformBuffer,
        bindGroup,
        data: new Float32Array(OBJECT_UNIFORM_SIZE_2D / 4),
      };
    }
    return shape._gpu;
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
              arrayStride: VERTEX_STRIDE_2D,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
                { shaderLocation: 1, offset: 8, format: 'float32x2' }, // uv
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [
            {
              format: this.format,
              blend: {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                },
                alpha: {
                  srcFactor: 'one',
                  dstFactor: 'one-minus-src-alpha',
                },
              },
            },
          ],
        },
        primitive: {
          topology: 'triangle-list',
          cullMode: 'none',
        },
      });
      this._pipelines.set(key, pipeline);
    }
    return pipeline;
  }
}
