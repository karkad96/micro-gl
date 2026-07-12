import { Material2d } from './Material2d.js';
import { BASIC_FRAGMENT_SHADER_2D } from '../shaders/fragments.js';

/**
 * Fills the shape with a flat color. Alpha below 1 shows through to
 * whatever was drawn underneath.
 */
export class BasicMaterial2d extends Material2d {
  get fragmentShader() {
    return BASIC_FRAGMENT_SHADER_2D;
  }
}
