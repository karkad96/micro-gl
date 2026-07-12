import { OrthographicCamera } from '../cameras/OrthographicCamera.js';

export const DEFAULT_SHADOW_MAP_SIZE = 1024;
export const DEFAULT_SHADOW_CAMERA_SIZE = 10;
export const DEFAULT_SHADOW_NEAR = 0.1;
export const DEFAULT_SHADOW_FAR = 50;
export const DEFAULT_SHADOW_BIAS = 0.001;
export const DEFAULT_SHADOW_NORMAL_BIAS = 0.02;

/**
 * CPU-side configuration for one directional-light shadow map.
 *
 * `camera.size` is the half-height of the square world-space area covered by
 * the map. Aim that area with `camera.lookAt(...)`; the renderer positions the
 * camera automatically from the light direction and its near/far range.
 */
export class DirectionalShadow {
  constructor() {
    this.mapSize = DEFAULT_SHADOW_MAP_SIZE;
    this.bias = DEFAULT_SHADOW_BIAS;
    this.normalBias = DEFAULT_SHADOW_NORMAL_BIAS;
    this.camera = new OrthographicCamera(
      DEFAULT_SHADOW_CAMERA_SIZE,
      1,
      DEFAULT_SHADOW_NEAR,
      DEFAULT_SHADOW_FAR,
    );
  }
}
