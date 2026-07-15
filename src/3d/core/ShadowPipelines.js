import {
  DEFAULT_DEPTH_COMPARE,
  INDEX_FORMAT,
  SHADER_ENTRY_POINT,
  isStripTopology,
} from '../../core/pipelineConstants.js';
import {
  DIRECTIONAL_SHADOW_DEPTH_FORMAT,
  SHADOW_SAMPLE_COUNT,
} from '../constants.js';
import { DIRECTIONAL_SHADOW_SHADER } from '../shaders/shadows.js';
import { vertexBufferLayouts } from '../shaders/vertexLayout.js';

/** Compiles and caches the vertex-only pipelines used by shadow casters. */
export class ShadowPipelines {
  constructor(device, shadowUniformLayout, objectLayout) {
    this.device = device;
    this._cache = new Map();
    this._module = null;
    this._layout = device.createPipelineLayout({
      label: 'Directional shadow pipeline layout',
      bindGroupLayouts: [shadowUniformLayout, objectLayout],
    });
  }

  pipelineFor(material, instanced = false) {
    const { topology, cullMode, frontFace } = material;
    const key = `${topology}|${cullMode}|${frontFace}|${instanced}`;
    let pipeline = this._cache.get(key);
    if (!pipeline) {
      const primitive = { topology, cullMode, frontFace };
      if (isStripTopology(topology)) {
        primitive.stripIndexFormat = INDEX_FORMAT;
      }
      pipeline = this.device.createRenderPipeline({
        label:
          `Directional shadow (${topology}, cull ${cullMode}, ` +
          `${frontFace}${instanced ? ', instanced' : ''})`,
        layout: this._layout,
        vertex: {
          module: this._moduleForShadowPass(),
          entryPoint: instanced
            ? SHADER_ENTRY_POINT.shadowInstancedVertex
            : SHADER_ENTRY_POINT.shadowVertex,
          buffers: vertexBufferLayouts(instanced),
        },
        primitive,
        multisample: { count: SHADOW_SAMPLE_COUNT },
        depthStencil: {
          format: DIRECTIONAL_SHADOW_DEPTH_FORMAT,
          depthWriteEnabled: true,
          depthCompare: DEFAULT_DEPTH_COMPARE,
        },
      });
      this._cache.set(key, pipeline);
    }
    return pipeline;
  }

  _moduleForShadowPass() {
    if (!this._module) {
      this._module = this.device.createShaderModule({
        label: 'Directional shadow depth shader',
        code: DIRECTIONAL_SHADOW_SHADER,
      });
    }
    return this._module;
  }
}
