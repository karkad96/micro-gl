import {
  DEFAULT_CULL_MODE_2D,
  DEFAULT_FRONT_FACE,
  DEFAULT_PRIMITIVE_TOPOLOGY,
} from '../../core/pipelineConstants.js';
import { composeShaderCode } from '../../core/composeShaderCode.js';
import {
  INSTANCED_SHAPE_SHADER_PREFIX,
  SHAPE_SHADER_PREFIX,
} from '../shaders/vertexStages.js';

/**
 * Base class for 2D materials. It owns per-object parameters and pipeline
 * state; reusable WGSL stages live in `2d/shaders`.
 *
 * Every 2D shader shares the same uniform interface:
 *   @group(0) — per-frame data (the camera's view-projection Mat3)
 *   @group(1) — per-object data (world transform + color)
 * Custom fragment stages may read both groups.
 * There are no lights or normals. Mat3 uniforms use WGSL's padded
 * 16-byte column layout, which is the layout `Mat3.elements` stores.
 */
export class Material2d {
  /**
   * @param {object} [options]
   * @param {number[]} [options.color] [r, g, b] or [r, g, b, a] in 0..1 —
   *   alpha below 1 blends with what is behind
   * @param {Texture} [options.map] texture the shader can sample at the
   *   shape's uvs — only used when `usesMap` is true
   * @param {boolean} [options.usesMap] whether the fragment shader declares
   *   the map and sampler bindings. It defaults to whether `map` was supplied
   *   for compatibility; custom material subclasses should set it explicitly.
   *   It is fixed for the material's lifetime so replacing or clearing `map`
   *   cannot silently change its pipeline layout
   * @param {GPUPrimitiveTopology} [options.topology]
   *   'triangle-list' (default), 'triangle-strip', 'line-list',
   *   'line-strip' or 'point-list'
   * @param {GPUCullMode} [options.cullMode] 'none' (default — a negative
   *   scale flips a shape's winding and it should stay visible), 'back'
   *   or 'front'; only applies to triangle topologies
   * @param {GPUFrontFace} [options.frontFace] 'ccw' (default) or 'cw'
   */
  constructor({
    color = [1, 1, 1],
    map = null,
    usesMap = map !== null,
    topology = DEFAULT_PRIMITIVE_TOPOLOGY,
    cullMode = DEFAULT_CULL_MODE_2D,
    frontFace = DEFAULT_FRONT_FACE,
  } = {}) {
    this.color = color;
    this.map = map;
    Object.defineProperty(this, 'usesMap', {
      value: Boolean(usesMap),
      enumerable: true,
    });
    this.topology = topology;
    this.cullMode = cullMode;
    this.frontFace = frontFace;
  }

  /** Full WGSL source with `vs` and `fs` entry points. */
  get shaderCode() {
    return composeShaderCode(Material2d.SHARED_WGSL, this.fragmentShader);
  }

  /** Full WGSL source whose vertex stage reads per-instance data. */
  get instancedShaderCode() {
    return composeShaderCode(Material2d.INSTANCED_WGSL, this.fragmentShader);
  }

  /** Fragment-stage WGSL supplied by a concrete material. */
  get fragmentShader() {
    throw new Error('Material2d subclasses must implement fragmentShader');
  }

  // Mutable for compatibility with code that customized these fields directly.
  static SHARED_WGSL = SHAPE_SHADER_PREFIX;
  static INSTANCED_WGSL = INSTANCED_SHAPE_SHADER_PREFIX;
}
