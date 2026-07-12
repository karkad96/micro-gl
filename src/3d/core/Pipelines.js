import {
  DEFAULT_DEPTH_COMPARE,
  INDEX_FORMAT,
  SHADER_ENTRY_POINT,
  STRAIGHT_ALPHA_BLEND,
  isStripTopology,
} from '../../core/pipelineConstants.js';
import {
  createMaterialPipelineLayouts,
} from '../../core/createMaterialPipelineLayouts.js';
import {
  DEPTH_FORMAT,
  SINGLE_SAMPLE_COUNT,
} from '../../core/rendererConfig.js';
import { materialUsesMap } from '../../core/materialResources.js';
import { vertexBufferLayouts } from '../shaders/vertexLayout.js';

/**
 * Compiles and caches the render pipelines for materials, and owns the
 * bind group / pipeline layouts every shader shares (the
 * @group(0) / @group(1) uniform interface in Material).
 *
 * A pipeline is keyed by composed shader source + pipeline state (topology,
 * cull mode, front face, textured / instanced / transparent or not):
 * each combination compiles once and is shared by every material
 * instance that matches. Transparent variants alpha-blend like the 2D
 * pipelines and don't write the depth buffer (the renderer draws them
 * after the opaque meshes, sorted back-to-front).
 */
export class Pipelines {
  constructor(device, format, sampleCount = SINGLE_SAMPLE_COUNT) {
    this.device = device;
    this.format = format;
    /** MSAA sample count of the renderer's color/depth targets. */
    this.sampleCount = sampleCount;
    // composed WGSL -> Map of pipeline-state key -> GPURenderPipeline
    this._cache = new Map();
    // WGSL source -> GPUShaderModule, so pipeline variants that share a
    // shader (e.g. the same material at another topology) compile once.
    this._modules = new Map();

    Object.assign(
      this,
      createMaterialPipelineLayouts(
        device,
        GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        { shadows: true },
      ),
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
    const transparent = !!material.transparent;
    const stateKey = `${topology}|${cullMode}|${frontFace}|${textured}|${instanced}|${transparent}`;
    let pipeline = variants.get(stateKey);
    if (!pipeline) {
      pipeline = this._build(material, shaderCode, {
        textured,
        instanced,
        transparent,
      });
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

  _build(material, shaderCode, { textured, instanced, transparent }) {
    const { topology, cullMode, frontFace } = material;
    const primitive = { topology, cullMode, frontFace };
    // Indexed draws on strip topologies must declare the index format
    // up front; the renderer always uses uint32 indices.
    if (isStripTopology(topology)) {
      primitive.stripIndexFormat = INDEX_FORMAT;
    }
    const buffers = vertexBufferLayouts(instanced);
    const target = { format: this.format };
    if (transparent) {
      target.blend = STRAIGHT_ALPHA_BLEND;
    }
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
        targets: [target],
      },
      primitive,
      multisample: { count: this.sampleCount },
      depthStencil: {
        format: DEPTH_FORMAT,
        // Transparent meshes test against the depth buffer (opaque
        // things still hide them) but don't write it: they draw last,
        // back-to-front, and shouldn't mask each other.
        depthWriteEnabled: !transparent,
        depthCompare: DEFAULT_DEPTH_COMPARE,
      },
    });
  }
}
