import { Material } from './Material.js';
import { BASIC_FRAGMENT_SHADER } from '../shaders/fragments.js';

/**
 * An unlit material: renders a flat color, ignoring all lights.
 */
export class BasicMaterial extends Material {
  get fragmentShader() {
    return BASIC_FRAGMENT_SHADER;
  }
}
