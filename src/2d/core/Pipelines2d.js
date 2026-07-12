import { VERTEX_STRIDE_2D } from '../geometries/Geometry2d.js';

/**
 * Compiles and caches the render pipelines for 2D materials, and owns
 * the bind group / pipeline layouts every 2D shader shares (the
 * @group(0) / @group(1) uniform interface in Material2d).
 *
 * A pipeline is keyed by material class + pipeline state (topology,
 * cull mode, front face, textured or not, instanced or not): each
 * combination compiles once and is shared by every material instance
 * that matches.
 *
 * The pipelines differ from the 3D ones where 2D differs from 3D:
 *   - alpha blending is enabled (shapes draw back-to-front, so
 *     transparency just works — no depth buffer involved)
 *   - no depth/stencil state (the 2D render pass has no depth attachment)
 *   - culling defaults to 'none': a negative scale flips a shape's
 *     winding and it should still be visible
 */
export class Pipelines2d {
  constructor(device, format) {
    this.device = device;
    this.format = format;
    // material class -> Map of pipeline-state key -> GPURenderPipeline
    this._cache = new Map();
    // WGSL source -> GPUShaderModule, so pipeline variants that share a
    // shader (e.g. the same material at another topology) compile once.
    this._modules = new Map();

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

  /** The render pipeline for a material's class and pipeline state. */
  pipelineFor(material, instanced = false) {
    if (material.requiresMap && !material.map) {
      // Without this the missing texture bindings surface later as a
      // cryptic pipeline/bind-group validation error.
      throw new Error(
        `${material.constructor.name}: \`map\` was cleared, but this ` +
          'material always samples its texture — assign a Texture or ' +
          'switch to a material without a map',
      );
    }
    const { topology, cullMode, frontFace } = material;
    let variants = this._cache.get(material.constructor);
    if (!variants) {
      variants = new Map();
      this._cache.set(material.constructor, variants);
    }
    const textured = !!material.map;
    const stateKey = `${topology}|${cullMode}|${frontFace}|${textured}|${instanced}`;
    let pipeline = variants.get(stateKey);
    if (!pipeline) {
      pipeline = this._build(material, { textured, instanced });
      variants.set(stateKey, pipeline);
    }
    return pipeline;
  }

  _moduleFor(code) {
    let module = this._modules.get(code);
    if (!module) {
      module = this.device.createShaderModule({ code });
      this._modules.set(code, module);
    }
    return module;
  }

  _build(material, { textured, instanced }) {
    const { topology, cullMode, frontFace } = material;
    const primitive = { topology, cullMode, frontFace };
    // Indexed draws on strip topologies must declare the index format
    // up front; the renderer always uses uint32 indices.
    if (topology === 'triangle-strip' || topology === 'line-strip') {
      primitive.stripIndexFormat = 'uint32';
    }
    const buffers = [
      {
        arrayStride: VERTEX_STRIDE_2D,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
          { shaderLocation: 1, offset: 8, format: 'float32x2' }, // uv
        ],
      },
    ];
    if (instanced) {
      // Per-instance data, matching InstancedShape2d.instanceData:
      // a mat3 as three 16-byte-padded vec3 columns, then rgba.
      buffers.push({
        arrayStride: 64,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 2, offset: 0, format: 'float32x3' },
          { shaderLocation: 3, offset: 16, format: 'float32x3' },
          { shaderLocation: 4, offset: 32, format: 'float32x3' },
          { shaderLocation: 5, offset: 48, format: 'float32x4' }, // color
        ],
      });
    }
    const module = this._moduleFor(
      instanced ? material.instancedShaderCode : material.shaderCode,
    );
    return this.device.createRenderPipeline({
      layout: textured ? this.texturedPipelineLayout : this.pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vs',
        buffers,
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
      primitive,
    });
  }
}
