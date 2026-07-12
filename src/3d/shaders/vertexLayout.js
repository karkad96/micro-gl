import { VERTEX_STRIDE } from '../geometries/Geometry.js';
import { INSTANCE_SIZE } from '../constants.js';
import { INSTANCE_STEP_MODE } from '../../core/pipelineConstants.js';

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const VEC2_BYTES = 2 * FLOAT_BYTES;
const VEC3_BYTES = 3 * FLOAT_BYTES;
const VEC4_BYTES = 4 * FLOAT_BYTES;
const MAT4_BYTES = 4 * VEC4_BYTES;

/** Vertex input locations shared by WGSL and the GPU buffer descriptors. */
export const VERTEX_ATTRIBUTE = Object.freeze({
  position: 0,
  normal: 1,
  uv: 2,
  instanceMatrix0: 3,
  instanceMatrix1: 4,
  instanceMatrix2: 5,
  instanceMatrix3: 6,
  instanceColor: 7,
});

export const GEOMETRY_VERTEX_BUFFER_LAYOUT = Object.freeze({
  arrayStride: VERTEX_STRIDE,
  attributes: Object.freeze([
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE.position,
      offset: 0,
      format: 'float32x3',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE.normal,
      offset: VEC3_BYTES,
      format: 'float32x3',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE.uv,
      offset: 2 * VEC3_BYTES,
      format: 'float32x2',
    }),
  ]),
});

export const INSTANCE_VERTEX_BUFFER_LAYOUT = Object.freeze({
  arrayStride: INSTANCE_SIZE * FLOAT_BYTES,
  stepMode: INSTANCE_STEP_MODE,
  attributes: Object.freeze([
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE.instanceMatrix0,
      offset: 0,
      format: 'float32x4',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE.instanceMatrix1,
      offset: VEC4_BYTES,
      format: 'float32x4',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE.instanceMatrix2,
      offset: 2 * VEC4_BYTES,
      format: 'float32x4',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE.instanceMatrix3,
      offset: 3 * VEC4_BYTES,
      format: 'float32x4',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE.instanceColor,
      offset: MAT4_BYTES,
      format: 'float32x4',
    }),
  ]),
});

const STANDARD_VERTEX_BUFFERS = Object.freeze([GEOMETRY_VERTEX_BUFFER_LAYOUT]);
const INSTANCED_VERTEX_BUFFERS = Object.freeze([
  GEOMETRY_VERTEX_BUFFER_LAYOUT,
  INSTANCE_VERTEX_BUFFER_LAYOUT,
]);

/** GPU vertex buffer layouts for a regular or instanced mesh pipeline. */
export function vertexBufferLayouts(instanced) {
  return instanced ? INSTANCED_VERTEX_BUFFERS : STANDARD_VERTEX_BUFFERS;
}
