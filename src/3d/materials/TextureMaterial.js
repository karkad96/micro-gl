import { Material } from './Material.js';
import { TEXTURE_FRAGMENT_SHADER } from '../shaders/fragments.js';

/** @typedef {import('../../core/Texture.js').Texture} Texture */

/**
 * A diffuse (Lambertian) material that gets its surface color from a
 * texture sampled at the mesh's uvs, tinted by `color` — LambertMaterial
 * with a `map`. Requires the map: the shader's texture bindings must
 * exist when the pipeline is created.
 */
export class TextureMaterial extends Material {
  /** @param {{map: Texture, color?: number[]}} options see Material for the rest */
  constructor(options = {}) {
    super({ ...options, usesMap: true });
    // Compatibility alias retained for existing material introspection.
    this.requiresMap = true;
    if (!this.map) {
      throw new Error('TextureMaterial requires a `map` texture');
    }
  }

  get fragmentShader() {
    return TEXTURE_FRAGMENT_SHADER;
  }
}
