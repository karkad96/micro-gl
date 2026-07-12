import { Material2d } from './Material2d.js';

/**
 * Fills the shape with a texture sampled at its uvs, tinted by `color` —
 * the 2D sprite workhorse. The texture's alpha blends like the color
 * alpha in BasicMaterial2d. Requires the map: the shader's texture
 * bindings must exist when the pipeline is created.
 *
 * RectGeometry's v axis points up while images store their top row
 * first, so image sprites usually want the texture created with
 * `flipY: true`.
 */
export class SpriteMaterial2d extends Material2d {
  /** @param {{map: Texture, color?: number[]}} options see Material2d for the rest */
  constructor(options = {}) {
    super(options);
    if (!this.map) {
      throw new Error('SpriteMaterial2d requires a `map` texture');
    }
  }

  get fragmentShader() {
    return /* wgsl */ `
@group(1) @binding(1) var uMap: texture_2d<f32>;
@group(1) @binding(2) var uMapSampler: sampler;

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let base = textureSample(uMap, uMapSampler, input.uv) * objectColor(input);
  return vec4f(linearToSrgb(base.rgb), base.a);
}
`;
  }
}
