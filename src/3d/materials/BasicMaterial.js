import { Material } from './Material.js';

/**
 * An unlit material: renders a flat color, ignoring all lights.
 */
export class BasicMaterial extends Material {
  get fragmentShader() {
    return /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return objectColor(input);
}
`;
  }
}
