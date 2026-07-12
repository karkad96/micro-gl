import { Material } from './Material.js';

/**
 * A simple diffuse (Lambertian) material: brightness depends on the
 * angle between the surface and the scene's lights (the
 * DirectionalLight and any PointLights), plus a flat ambient term.
 */
export class LambertMaterial extends Material {
  get fragmentShader() {
    return /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let base = objectColor(input);
  let lighting = diffuseLighting(normalize(input.worldNormal), input.worldPosition);
  return vec4f(linearToSrgb(base.rgb * lighting), base.a);
}
`;
  }
}
