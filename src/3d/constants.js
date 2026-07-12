/** Point-light array length shared by CPU uniform writers and WGSL. */
export const MAX_POINT_LIGHTS = 4;

/** Floats per instance: a mat4 (16) followed by an rgba color (4). */
export const INSTANCE_SIZE = 20;

/** Sampled depth format used by directional shadow maps. */
export const DIRECTIONAL_SHADOW_DEPTH_FORMAT = 'depth32float';

/** A shadow map is always rendered without MSAA. */
export const SHADOW_SAMPLE_COUNT = 1;

