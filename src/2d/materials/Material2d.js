/**
 * Base class for 2D materials, mirroring the 3D Material: a WGSL shader
 * plus per-object parameters (currently just a color) and the
 * fixed-function pipeline state used to draw with it (topology, culling,
 * winding).
 *
 * Every 2D shader shares the same uniform interface:
 *   @group(0) — per-frame data (the camera's view-projection Mat3)
 *   @group(1) — per-object data (world transform + color)
 * There are no lights and no normals — transforms are mat3x3f and the
 * vertex stage is three lines.
 *
 * Note the WGSL alignment rule this relies on: a `mat3x3f` in a uniform
 * buffer stores each column padded to 16 bytes (48 bytes total), which
 * is exactly the layout `Mat3.elements` uses.
 */
export class Material2d {
  /**
   * @param {object} [options]
   * @param {number[]} [options.color] [r, g, b] or [r, g, b, a] in 0..1 —
   *   alpha below 1 blends with what is behind
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
    topology = 'triangle-list',
    cullMode = 'none',
    frontFace = 'ccw',
  } = {}) {
    this.color = color;
    this.topology = topology;
    this.cullMode = cullMode;
    this.frontFace = frontFace;
  }

  /** Full WGSL source with `vs` and `fs` entry points. Subclasses provide the fragment stage. */
  get shaderCode() {
    return Material2d.SHARED_WGSL + this.fragmentShader;
  }

  get fragmentShader() {
    throw new Error('Material2d subclasses must implement fragmentShader');
  }
}

/**
 * Uniform structs and the vertex stage shared by all 2D materials.
 * Field offsets must match what Renderer2d writes into the uniform buffers.
 */
Material2d.SHARED_WGSL = /* wgsl */ `
struct FrameUniforms {
  viewProjection: mat3x3f,
};

struct ObjectUniforms {
  transform: mat3x3f,
  color: vec4f,
};

@group(0) @binding(0) var<uniform> uFrame: FrameUniforms;
@group(1) @binding(0) var<uniform> uObject: ObjectUniforms;

struct VertexIn {
  @location(0) position: vec2f,
  @location(1) uv: vec2f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  let p = uFrame.viewProjection * uObject.transform * vec3f(input.position, 1.0);
  out.position = vec4f(p.xy, 0.0, 1.0);
  out.uv = input.uv;
  return out;
}
`;
