import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
} from '../../core/pipelineConstants.js';

export const BASIC_FRAGMENT_SHADER = /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return objectColor(input);
}
`;

export const LAMBERT_FRAGMENT_SHADER = /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let base = objectColor(input);
  let lighting = diffuseLighting(normalize(input.worldNormal), input.worldPosition);
  return vec4f(base.rgb * lighting, base.a);
}
`;

export const TEXTURE_FRAGMENT_SHADER = /* wgsl */ `
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.map})
var uMap: texture_2d<f32>;
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.sampler})
var uMapSampler: sampler;

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let base = textureSample(uMap, uMapSampler, input.uv) * objectColor(input);
  let lighting = diffuseLighting(normalize(input.worldNormal), input.worldPosition);
  return vec4f(base.rgb * lighting, base.a);
}
`;
