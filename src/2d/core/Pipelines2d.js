import {
  INDEX_FORMAT,
  SHADER_ENTRY_POINT,
  STRAIGHT_ALPHA_BLEND,
  isStripTopology,
} from '../../core/pipelineConstants.js';
import {
  createMaterialPipelineLayouts,
} from '../../core/createMaterialPipelineLayouts.js';
import { materialUsesMap } from '../../core/materialResources.js';
import { SINGLE_SAMPLE_COUNT } from '../../core/rendererConfig.js';
import { vertexBufferLayouts2d } from '../shaders/vertexLayout.js';

/**
 * Compiles and caches the render pipelines for 2D materials, and owns
 * the bind group / pipeline layouts every 2D shader shares (the
 * @group(0) / @group(1) uniform interface in Material2d).
 *
 * A pipeline is keyed by composed shader source + pipeline state (topology,
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
  constructor(device, format, sampleCount = SINGLE_SAMPLE_COUNT) {
    this.device = device;
    this.format = format;
    /** MSAA sample count of the renderer's color target. */
    this.sampleCount = sampleCount;
    // composed WGSL -> Map of pipeline-state key -> GPURenderPipeline
    this._cache = new Map();
    // WGSL source -> GPUShaderModule, so pipeline variants that share a
    // shader (e.g. the same material at another topology) compile once.
    this._modules = new Map();

    Object.assign(
      this,
      createMaterialPipelineLayouts(device, GPUShaderStage.VERTEX),
    );
  }

  /** The render pipeline for a material's shader and fixed-function state. */
  pipelineFor(material, instanced = false) {
    const { topology, cullMode, frontFace } = material;
    const shaderCode = instanced
      ? material.instancedShaderCode
      : material.shaderCode;
    let variants = this._cache.get(shaderCode);
    if (!variants) {
      variants = new Map();
      this._cache.set(shaderCode, variants);
    }
    const textured = materialUsesMap(material);
    const stateKey = `${topology}|${cullMode}|${frontFace}|${textured}|${instanced}`;
    let pipeline = variants.get(stateKey);
    if (!pipeline) {
      pipeline = this._build(material, shaderCode, { textured, instanced });
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

  _build(material, shaderCode, { textured, instanced }) {
    const { topology, cullMode, frontFace } = material;
    const primitive = { topology, cullMode, frontFace };
    // Indexed draws on strip topologies must declare the index format
    // up front; the renderer always uses uint32 indices.
    if (isStripTopology(topology)) {
      primitive.stripIndexFormat = INDEX_FORMAT;
    }
    const buffers = vertexBufferLayouts2d(instanced);
    const module = this._moduleFor(shaderCode);
    return this.device.createRenderPipeline({
      layout: textured ? this.texturedPipelineLayout : this.pipelineLayout,
      vertex: {
        module,
        entryPoint: SHADER_ENTRY_POINT.vertex,
        buffers,
      },
      fragment: {
        module,
        entryPoint: SHADER_ENTRY_POINT.fragment,
        targets: [
          {
            format: this.format,
            blend: STRAIGHT_ALPHA_BLEND,
          },
        ],
      },
      primitive,
      multisample: { count: this.sampleCount },
    });
  }
}
