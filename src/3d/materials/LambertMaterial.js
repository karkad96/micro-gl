import { Material } from './Material.js';
import { LAMBERT_FRAGMENT_SHADER } from '../shaders/fragments.js';

/**
 * A simple diffuse (Lambertian) material: brightness depends on the
 * angle between the surface and the scene's lights (the
 * DirectionalLight and any PointLights), plus a flat ambient term.
 */
export class LambertMaterial extends Material {
  get fragmentShader() {
    return LAMBERT_FRAGMENT_SHADER;
  }
}
