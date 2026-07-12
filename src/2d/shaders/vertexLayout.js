import { VERTEX_STRIDE_2D } from '../geometries/Geometry2d.js';
import { INSTANCE_SIZE_2D } from '../constants.js';
import { INSTANCE_STEP_MODE } from '../../core/pipelineConstants.js';

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const VEC2_BYTES = 2 * FLOAT_BYTES;
const PADDED_VEC3_BYTES = 4 * FLOAT_BYTES;
const MAT3_BYTES = 3 * PADDED_VEC3_BYTES;

/** Vertex input locations shared by WGSL and the GPU buffer descriptors. */
export const VERTEX_ATTRIBUTE_2D = Object.freeze({
  position: 0,
  uv: 1,
  instanceMatrix0: 2,
  instanceMatrix1: 3,
  instanceMatrix2: 4,
  instanceColor: 5,
});

export const GEOMETRY_VERTEX_BUFFER_LAYOUT_2D = Object.freeze({
  arrayStride: VERTEX_STRIDE_2D,
  attributes: Object.freeze([
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE_2D.position,
      offset: 0,
      format: 'float32x2',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE_2D.uv,
      offset: VEC2_BYTES,
      format: 'float32x2',
    }),
  ]),
});

export const INSTANCE_VERTEX_BUFFER_LAYOUT_2D = Object.freeze({
  arrayStride: INSTANCE_SIZE_2D * FLOAT_BYTES,
  stepMode: INSTANCE_STEP_MODE,
  attributes: Object.freeze([
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE_2D.instanceMatrix0,
      offset: 0,
      format: 'float32x3',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE_2D.instanceMatrix1,
      offset: PADDED_VEC3_BYTES,
      format: 'float32x3',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE_2D.instanceMatrix2,
      offset: 2 * PADDED_VEC3_BYTES,
      format: 'float32x3',
    }),
    Object.freeze({
      shaderLocation: VERTEX_ATTRIBUTE_2D.instanceColor,
      offset: MAT3_BYTES,
      format: 'float32x4',
    }),
  ]),
});

const STANDARD_VERTEX_BUFFERS_2D = Object.freeze([
  GEOMETRY_VERTEX_BUFFER_LAYOUT_2D,
]);
const INSTANCED_VERTEX_BUFFERS_2D = Object.freeze([
  GEOMETRY_VERTEX_BUFFER_LAYOUT_2D,
  INSTANCE_VERTEX_BUFFER_LAYOUT_2D,
]);

/** GPU vertex buffer layouts for a regular or instanced shape pipeline. */
export function vertexBufferLayouts2d(instanced) {
  return instanced ? INSTANCED_VERTEX_BUFFERS_2D : STANDARD_VERTEX_BUFFERS_2D;
}
