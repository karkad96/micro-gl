import { Material } from './Material.js';

/**
 * A simple diffuse (Lambertian) material: brightness depends on the
 * angle between the surface and the scene's DirectionalLight, plus
 * a flat ambient term.
 */
export class LambertMaterial extends Material {
  get fragmentShader() {
    return /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let base = objectColor(input);
  let n = normalize(input.worldNormal);
  let toLight = normalize(-uFrame.lightDirection);
  let diffuse = max(dot(n, toLight), 0.0) * uFrame.lightColor;
  let lighting = uFrame.ambientColor + diffuse;
  return vec4f(base.rgb * lighting, base.a);
}
`;
  }
}
