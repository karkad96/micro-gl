import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
} from '../../core/pipelineConstants.js';

export const BASIC_FRAGMENT_SHADER_2D = /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return objectColor(input);
}
`;

export const SPRITE_FRAGMENT_SHADER_2D = /* wgsl */ `
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.map})
var uMap: texture_2d<f32>;
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.sampler})
var uMapSampler: sampler;

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return textureSample(uMap, uMapSampler, input.uv) * objectColor(input);
}
`;
