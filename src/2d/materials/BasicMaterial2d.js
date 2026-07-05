import { Material2d } from './Material2d.js';

/**
 * Fills the shape with a flat color. Alpha below 1 shows through to
 * whatever was drawn underneath.
 */
export class BasicMaterial2d extends Material2d {
  get fragmentShader() {
    return /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return objectColor(input);
}
`;
  }
}
