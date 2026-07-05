import { Material2D } from './Material2D.js';

/**
 * Fills the shape with a flat color. Alpha below 1 shows through to
 * whatever was drawn underneath.
 */
export class BasicMaterial2D extends Material2D {
  get fragmentShader() {
    return /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return uObject.color;
}
`;
  }
}
