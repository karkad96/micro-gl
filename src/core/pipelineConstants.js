/**
 * Names shared by the JavaScript pipeline descriptors and WGSL modules.
 * Keeping the interface in one place prevents a shader binding or entry
 * point from silently drifting away from its matching WebGPU descriptor.
 */
export const SHADER_BIND_GROUP = Object.freeze({
  frame: 0,
  object: 1,
});

export const SHADER_BINDING = Object.freeze({
  uniforms: 0,
  map: 1,
  sampler: 2,
});

export const SHADER_ENTRY_POINT = Object.freeze({
  vertex: 'vs',
  fragment: 'fs',
});

export const VERTEX_BUFFER_SLOT = Object.freeze({
  geometry: 0,
  instance: 1,
});

export const DEFAULT_PRIMITIVE_TOPOLOGY = 'triangle-list';
export const DEFAULT_FRONT_FACE = 'ccw';
export const DEFAULT_CULL_MODE_3D = 'back';
export const DEFAULT_CULL_MODE_2D = 'none';
export const DEFAULT_DEPTH_COMPARE = 'less';
export const INDEX_FORMAT = 'uint32';
export const INSTANCE_STEP_MODE = 'instance';

const STRIP_TOPOLOGIES = new Set(['triangle-strip', 'line-strip']);

/** Whether an indexed primitive topology needs `stripIndexFormat`. */
export function isStripTopology(topology) {
  return STRIP_TOPOLOGIES.has(topology);
}

/** Straight-alpha blending shared by transparent 3D and all 2D pipelines. */
export const STRAIGHT_ALPHA_BLEND = Object.freeze({
  color: Object.freeze({
    srcFactor: 'src-alpha',
    dstFactor: 'one-minus-src-alpha',
  }),
  alpha: Object.freeze({
    srcFactor: 'one',
    dstFactor: 'one-minus-src-alpha',
  }),
});
