import { Material } from './Material.js';

/**
 * A diffuse (Lambertian) material that gets its surface color from a
 * texture sampled at the mesh's uvs, tinted by `color` — LambertMaterial
 * with a `map`. Requires the map: the shader's texture bindings must
 * exist when the pipeline is created.
 */
export class TextureMaterial extends Material {
  /** @param {{map: Texture, color?: number[]}} options see Material for the rest */
  constructor(options = {}) {
    super(options);
    if (!this.map) {
      throw new Error('TextureMaterial requires a `map` texture');
    }
  }

  get fragmentShader() {
    return /* wgsl */ `
@group(1) @binding(1) var uMap: texture_2d<f32>;
@group(1) @binding(2) var uMapSampler: sampler;

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let base = textureSample(uMap, uMapSampler, input.uv) * objectColor(input);
  let n = normalize(input.worldNormal);
  let toLight = normalize(-uFrame.lightDirection);
  let diffuse = max(dot(n, toLight), 0.0) * uFrame.lightColor;
  let lighting = uFrame.ambientColor + diffuse;
  return vec4f(linearToSrgb(base.rgb * lighting), base.a);
}
`;
  }
}
