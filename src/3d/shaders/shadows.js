import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
} from '../../core/pipelineConstants.js';
import { VERTEX_ATTRIBUTE } from './vertexLayout.js';
import {
  OBJECT_UNIFORM_WGSL,
  SHADOW_UNIFORM_WGSL,
} from './shared.js';

/** Vertex-only shader used by regular and instanced shadow casters. */
export const DIRECTIONAL_SHADOW_SHADER = /* wgsl */ `
${SHADOW_UNIFORM_WGSL}
${OBJECT_UNIFORM_WGSL}

@group(${SHADER_BIND_GROUP.frame}) @binding(${SHADER_BINDING.uniforms})
var<uniform> uShadow: ShadowUniforms;
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.uniforms})
var<uniform> uObject: ObjectUniforms;

struct ShadowVertexIn {
  @location(${VERTEX_ATTRIBUTE.position}) position: vec3f,
};

struct ShadowInstanceIn {
  @location(${VERTEX_ATTRIBUTE.instanceMatrix0}) im0: vec4f,
  @location(${VERTEX_ATTRIBUTE.instanceMatrix1}) im1: vec4f,
  @location(${VERTEX_ATTRIBUTE.instanceMatrix2}) im2: vec4f,
  @location(${VERTEX_ATTRIBUTE.instanceMatrix3}) im3: vec4f,
};

@vertex
fn vsShadow(input: ShadowVertexIn) -> @builtin(position) vec4f {
  return uShadow.viewProjection * uObject.model
    * vec4f(input.position, 1.0);
}

@vertex
fn vsShadowInstanced(
  input: ShadowVertexIn,
  instance: ShadowInstanceIn,
) -> @builtin(position) vec4f {
  let instanceMatrix = mat4x4f(
    instance.im0,
    instance.im1,
    instance.im2,
    instance.im3,
  );
  return uShadow.viewProjection * uObject.model * instanceMatrix
    * vec4f(input.position, 1.0);
}
`;
