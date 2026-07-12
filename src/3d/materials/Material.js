/**
 * Base class for materials. A material is essentially a WGSL shader plus
 * per-object parameters (a color and optionally a texture map) and the
 * fixed-function pipeline state used to draw with it (topology, culling,
 * winding, transparency).
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
   * @param {Texture}  [options.map]      texture the shader can sample at
   *   the mesh's uvs — only used by materials whose fragment shader
   *   samples it (see TextureMaterial)
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
    topology = 'triangle-list',
    cullMode = 'back',
    frontFace = 'ccw',
    transparent = false,
  } = {}) {
    this.color = color;
    this.map = map;
    this.topology = topology;
    this.cullMode = cullMode;
    this.frontFace = frontFace;
    this.transparent = transparent;
  }

  /** Full WGSL source with `vs` and `fs` entry points. Subclasses provide the fragment stage. */
  get shaderCode() {
    return Material.SHARED_WGSL + this.fragmentShader;
  }

  /** Like shaderCode, but the vertex stage reads per-instance data (see InstancedMesh). */
  get instancedShaderCode() {
    return Material.INSTANCED_WGSL + this.fragmentShader;
  }

  get fragmentShader() {
    throw new Error('Material subclasses must implement fragmentShader');
  }
}

/**
 * Uniform structs shared by both vertex stages. Field offsets must
 * match what Renderer writes into the uniform buffers.
 */
const STRUCTS_WGSL = /* wgsl */ `
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

// Shading happens in linear space (colors are decoded by the renderer,
// texture samples by their '-srgb' format); this encodes the finished
// color for the non-sRGB swap chain. Fragment shaders end with it.
fn linearToSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}
`;

/**
 * The vertex stage shared by all materials. `objectColor` is how
 * fragment shaders read the surface color — each vertex-stage variant
 * defines it, so the same fragment code works instanced and not.
 */
Material.SHARED_WGSL =
  STRUCTS_WGSL +
  /* wgsl */ `
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

fn objectColor(input: VertexOut) -> vec4f {
  return uObject.color;
}
`;

/**
 * The instanced vertex stage: each instance carries a model matrix and
 * a color in an instance-step vertex buffer (see InstancedMesh; the
 * buffer layout lives in Pipelines). Both compose with the mesh's
 * own transform and material color, so an InstancedMesh still moves
 * with the scene graph and tints like any mesh.
 */
Material.INSTANCED_WGSL =
  STRUCTS_WGSL +
  /* wgsl */ `
struct InstanceIn {
  @location(3) im0: vec4f,
  @location(4) im1: vec4f,
  @location(5) im2: vec4f,
  @location(6) im3: vec4f,
  @location(7) color: vec4f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldNormal: vec3f,
  @location(1) uv: vec2f,
  @location(2) color: vec4f,
};

@vertex
fn vs(input: VertexIn, instance: InstanceIn) -> VertexOut {
  var out: VertexOut;
  let instanceMatrix = mat4x4f(instance.im0, instance.im1, instance.im2, instance.im3);
  let worldPosition = uObject.model * instanceMatrix * vec4f(input.position, 1.0);
  out.position = uFrame.viewProjection * worldPosition;
  // The instance matrix's upper 3x3 handles rotation + uniform scale
  // (lighting normalizes); per-instance non-uniform scale skews normals.
  let rotation = mat3x3f(instance.im0.xyz, instance.im1.xyz, instance.im2.xyz);
  out.worldNormal = (uObject.normalMatrix * vec4f(rotation * input.normal, 0.0)).xyz;
  out.uv = input.uv;
  out.color = instance.color;
  return out;
}

fn objectColor(input: VertexOut) -> vec4f {
  return input.color * uObject.color;
}
`;
