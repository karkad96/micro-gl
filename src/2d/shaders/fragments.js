import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
} from '../../core/pipelineConstants.js';

export const BASIC_FRAGMENT_SHADER_2D = /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let base = objectColor(input);
  return vec4f(linearToSrgb(base.rgb), base.a);
}
`;

export const SPRITE_FRAGMENT_SHADER_2D = /* wgsl */ `
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.map})
var uMap: texture_2d<f32>;
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.sampler})
var uMapSampler: sampler;

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let base = textureSample(uMap, uMapSampler, input.uv) * objectColor(input);
  return vec4f(linearToSrgb(base.rgb), base.a);
}
`;
