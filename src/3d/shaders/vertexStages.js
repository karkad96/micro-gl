import { SHARED_SHADER_CHUNKS } from './shared.js';
import { VERTEX_ATTRIBUTE } from './vertexLayout.js';

/** Shared chunks plus the regular mesh vertex stage. Append a fragment stage. */
export const MESH_SHADER_PREFIX =
  SHARED_SHADER_CHUNKS +
  /* wgsl */ `
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldNormal: vec3f,
  @location(1) uv: vec2f,
  @location(2) worldPosition: vec3f,
};

@vertex
fn vs(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  let worldPosition = uObject.model * vec4f(input.position, 1.0);
  out.position = uFrame.viewProjection * worldPosition;
  out.worldNormal = (uObject.normalMatrix * vec4f(input.normal, 0.0)).xyz;
  out.uv = input.uv;
  out.worldPosition = worldPosition.xyz;
  return out;
}

fn objectColor(input: VertexOut) -> vec4f {
  return uObject.color;
}
`;

/** Shared chunks plus the per-instance mesh vertex stage. Append a fragment stage. */
export const INSTANCED_MESH_SHADER_PREFIX =
  SHARED_SHADER_CHUNKS +
  /* wgsl */ `
struct InstanceIn {
  @location(${VERTEX_ATTRIBUTE.instanceMatrix0}) im0: vec4f,
  @location(${VERTEX_ATTRIBUTE.instanceMatrix1}) im1: vec4f,
  @location(${VERTEX_ATTRIBUTE.instanceMatrix2}) im2: vec4f,
  @location(${VERTEX_ATTRIBUTE.instanceMatrix3}) im3: vec4f,
  @location(${VERTEX_ATTRIBUTE.instanceColor}) color: vec4f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldNormal: vec3f,
  @location(1) uv: vec2f,
  @location(2) color: vec4f,
  @location(3) worldPosition: vec3f,
};

@vertex
fn vs(input: VertexIn, instance: InstanceIn) -> VertexOut {
  var out: VertexOut;
  let instanceMatrix = mat4x4f(instance.im0, instance.im1, instance.im2, instance.im3);
  let worldPosition = uObject.model * instanceMatrix * vec4f(input.position, 1.0);
  out.position = uFrame.viewProjection * worldPosition;
  // The instance matrix's upper 3x3 handles rotation + uniform scale
  // (lighting normalizes); per-instance non-uniform scale skews normals.
  let rotation = mat3x3f(instance.im0.xyz, instance.im1.xyz, instance.im2.xyz);
  out.worldNormal = (uObject.normalMatrix * vec4f(rotation * input.normal, 0.0)).xyz;
  out.uv = input.uv;
  out.color = instance.color;
  out.worldPosition = worldPosition.xyz;
  return out;
}

fn objectColor(input: VertexOut) -> vec4f {
  return input.color * uObject.color;
}
`;
