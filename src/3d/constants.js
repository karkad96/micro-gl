/** Point-light array length shared by CPU uniform writers and WGSL. */
export const MAX_POINT_LIGHTS = 4;

/** Floats occupied by an instance's mat4 transform. */
export const INSTANCE_MATRIX_COMPONENTS = 16;

/** Float offset at which an instance's rgba color starts. */
export const INSTANCE_COLOR_OFFSET = INSTANCE_MATRIX_COMPONENTS;

/** Floats per instance: a mat4 followed by an rgba color. */
export const INSTANCE_SIZE = INSTANCE_MATRIX_COMPONENTS + 4;

/** Sampled depth format used by directional shadow maps. */
export const DIRECTIONAL_SHADOW_DEPTH_FORMAT = 'depth32float';

/** A shadow map is always rendered without MSAA. */
export const SHADOW_SAMPLE_COUNT = 1;

