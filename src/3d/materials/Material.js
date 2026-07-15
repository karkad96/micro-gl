import {
  DEFAULT_CULL_MODE_3D,
  DEFAULT_FRONT_FACE,
  DEFAULT_PRIMITIVE_TOPOLOGY,
} from '../../core/pipelineConstants.js';
import { composeShaderCode } from '../../core/composeShaderCode.js';
import { MAX_POINT_LIGHTS } from '../constants.js';
import {
  INSTANCED_MESH_SHADER_PREFIX,
  MESH_SHADER_PREFIX,
} from '../shaders/vertexStages.js';

/**
 * Base class for materials. A material owns per-object parameters and
 * fixed-function pipeline state; reusable WGSL stages live in `3d/shaders`.
 *
 * Every shader shares the same uniform interface:
 *   @group(0) — per-frame data (camera + lights), owned by the renderer
 *   @group(1) — per-object data (transforms + color)
 *   @group(2) — renderer-owned directional shadow map and uniforms
 * The renderer caches pipelines by composed WGSL source and pipeline state,
 * so materials with the same shader share one pipeline while custom material
 * instances may still provide different fragment stages safely.
 */
export class Material {
  /**
   * @param {object} [options]
   * @param {number[]} [options.color]    [r, g, b] in 0..1
   * @param {Texture}  [options.map] texture the shader can sample at the
   *   mesh's uvs — only used when `usesMap` is true
   * @param {boolean} [options.usesMap] whether the fragment shader declares
   *   the map and sampler bindings. It defaults to whether `map` was supplied
   *   for compatibility; custom material subclasses should set it explicitly.
   *   It is fixed for the material's lifetime so replacing or clearing `map`
   *   cannot silently change its pipeline layout
   * @param {GPUPrimitiveTopology} [options.topology]
   *   'triangle-list' (default), 'triangle-strip', 'line-list',
   *   'line-strip' or 'point-list'
   * @param {GPUCullMode}  [options.cullMode]  'back' (default), 'front' or
   *   'none'; only applies to triangle topologies
   * @param {GPUFrontFace} [options.frontFace] 'ccw' (default) or 'cw'
   * @param {boolean} [options.transparent] alpha-blend this material: the
   *   renderer draws transparent meshes after all opaque ones, sorted
   *   back-to-front, and they stop writing the depth buffer. Combine
   *   with a color alpha below 1 (or a texture with alpha)
   */
  constructor({
    color = [1, 1, 1],
    map = null,
    usesMap = map !== null,
    topology = DEFAULT_PRIMITIVE_TOPOLOGY,
    cullMode = DEFAULT_CULL_MODE_3D,
    frontFace = DEFAULT_FRONT_FACE,
    transparent = false,
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
    this.transparent = transparent;
  }

  /** Full WGSL source with `vs` and `fs` entry points. */
  get shaderCode() {
    return composeShaderCode(Material.SHARED_WGSL, this.fragmentShader);
  }

  /** Full WGSL source whose vertex stage reads per-instance data. */
  get instancedShaderCode() {
    return composeShaderCode(Material.INSTANCED_WGSL, this.fragmentShader);
  }

  /** Fragment-stage WGSL supplied by a concrete material. */
  get fragmentShader() {
    throw new Error('Material subclasses must implement fragmentShader');
  }

  // Mutable for compatibility with code that customized these fields directly.
  static SHARED_WGSL = MESH_SHADER_PREFIX;
  static INSTANCED_WGSL = INSTANCED_MESH_SHADER_PREFIX;
}

export { MAX_POINT_LIGHTS };
