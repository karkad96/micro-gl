import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
} from '../../core/pipelineConstants.js';
import { VERTEX_ATTRIBUTE_2D } from './vertexLayout.js';

/** Uniform declarations and color helpers shared by every 2D shader. */
export const SHARED_SHADER_CHUNKS_2D = /* wgsl */ `
struct FrameUniforms {
  viewProjection: mat3x3f,
};

struct ObjectUniforms {
  transform: mat3x3f,
  color: vec4f,
};

@group(${SHADER_BIND_GROUP.frame}) @binding(${SHADER_BINDING.uniforms})
var<uniform> uFrame: FrameUniforms;
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.uniforms})
var<uniform> uObject: ObjectUniforms;

struct VertexIn {
  @location(${VERTEX_ATTRIBUTE_2D.position}) position: vec2f,
  @location(${VERTEX_ATTRIBUTE_2D.uv}) uv: vec2f,
};

// Shading happens in linear space (colors are decoded by the renderer,
// texture samples by their '-srgb' format); this encodes the finished
// color for the non-sRGB swap chain. Fragment shaders end with it.
fn linearToSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}
`;
