import { SHARED_SHADER_CHUNKS_2D } from './shared.js';
import { VERTEX_ATTRIBUTE_2D } from './vertexLayout.js';

/** Shared chunks plus the regular shape vertex stage. Append a fragment stage. */
export const SHAPE_SHADER_PREFIX =
  SHARED_SHADER_CHUNKS_2D +
  /* wgsl */ `
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  let p = uFrame.viewProjection * uObject.transform * vec3f(input.position, 1.0);
  out.position = vec4f(p.xy, 0.0, 1.0);
  out.uv = input.uv;
  return out;
}

fn objectColor(input: VertexOut) -> vec4f {
  return uObject.color;
}
`;

/** Shared chunks plus the per-instance shape vertex stage. Append a fragment stage. */
export const INSTANCED_SHAPE_SHADER_PREFIX =
  SHARED_SHADER_CHUNKS_2D +
  /* wgsl */ `
struct InstanceIn {
  @location(${VERTEX_ATTRIBUTE_2D.instanceMatrix0}) im0: vec3f,
  @location(${VERTEX_ATTRIBUTE_2D.instanceMatrix1}) im1: vec3f,
  @location(${VERTEX_ATTRIBUTE_2D.instanceMatrix2}) im2: vec3f,
  @location(${VERTEX_ATTRIBUTE_2D.instanceColor}) color: vec4f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
};

@vertex
fn vs(input: VertexIn, instance: InstanceIn) -> VertexOut {
  var out: VertexOut;
  let instanceMatrix = mat3x3f(instance.im0, instance.im1, instance.im2);
  let p = uFrame.viewProjection * uObject.transform * instanceMatrix
    * vec3f(input.position, 1.0);
  out.position = vec4f(p.xy, 0.0, 1.0);
  out.uv = input.uv;
  out.color = instance.color;
  return out;
}

fn objectColor(input: VertexOut) -> vec4f {
  return input.color * uObject.color;
}
`;
