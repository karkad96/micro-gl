/**
 * Base class for materials. A material is essentially a WGSL shader plus
 * per-object parameters (currently just a color) and the fixed-function
 * pipeline state used to draw with it (topology, culling, winding).
 *
 * Every shader shares the same uniform interface:
 *   @group(0) — per-frame data (camera + lights), owned by the renderer
 *   @group(1) — per-object data (transforms + color)
 * The renderer compiles one render pipeline per material class and
 * pipeline-state combination and caches it, so many meshes can share
 * the same shader.
 */
export class Material {
  /**
   * @param {object} [options]
   * @param {number[]} [options.color]    [r, g, b] in 0..1
   * @param {GPUPrimitiveTopology} [options.topology]
   *   'triangle-list' (default), 'triangle-strip', 'line-list',
   *   'line-strip' or 'point-list'
   * @param {GPUCullMode}  [options.cullMode]  'back' (default), 'front' or
   *   'none'; only applies to triangle topologies
   * @param {GPUFrontFace} [options.frontFace] 'ccw' (default) or 'cw'
   */
  constructor({
    color = [1, 1, 1],
    topology = 'triangle-list',
    cullMode = 'back',
    frontFace = 'ccw',
  } = {}) {
    this.color = color;
    this.topology = topology;
    this.cullMode = cullMode;
    this.frontFace = frontFace;
  }

  /** Full WGSL source with `vs` and `fs` entry points. Subclasses provide the fragment stage. */
  get shaderCode() {
    return Material.SHARED_WGSL + this.fragmentShader;
  }

  get fragmentShader() {
    throw new Error('Material subclasses must implement fragmentShader');
  }
}

/**
 * Uniform structs and the vertex stage shared by all materials.
 * Field offsets must match what Renderer writes into the uniform buffers.
 */
Material.SHARED_WGSL = /* wgsl */ `
struct FrameUniforms {
  viewProjection: mat4x4f,
  lightDirection: vec3f,
  lightColor: vec3f,
  ambientColor: vec3f,
};

struct ObjectUniforms {
  model: mat4x4f,
  normalMatrix: mat4x4f,
  color: vec4f,
};

@group(0) @binding(0) var<uniform> uFrame: FrameUniforms;
@group(1) @binding(0) var<uniform> uObject: ObjectUniforms;

struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldNormal: vec3f,
  @location(1) uv: vec2f,
};

@vertex
fn vs(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  let worldPosition = uObject.model * vec4f(input.position, 1.0);
  out.position = uFrame.viewProjection * worldPosition;
  out.worldNormal = (uObject.normalMatrix * vec4f(input.normal, 0.0)).xyz;
  out.uv = input.uv;
  return out;
}
`;
