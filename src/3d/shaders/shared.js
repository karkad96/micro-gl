import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
} from '../../core/pipelineConstants.js';
import { VERTEX_ATTRIBUTE } from './vertexLayout.js';
import { MAX_POINT_LIGHTS } from '../constants.js';

export { MAX_POINT_LIGHTS };

/** Uniform declarations and shading helpers shared by every 3D shader. */
export const SHARED_SHADER_CHUNKS = /* wgsl */ `
struct PointLightUniform {
  position: vec3f, // world space
  color: vec3f,    // linear, premultiplied by intensity
};

struct FrameUniforms {
  viewProjection: mat4x4f,
  lightDirection: vec3f,
  lightColor: vec3f,
  ambientColor: vec3f,
  // Packs into ambientColor's 16-byte slot; how many array entries are live.
  pointLightCount: f32,
  pointLights: array<PointLightUniform, ${MAX_POINT_LIGHTS}>,
};

struct ObjectUniforms {
  model: mat4x4f,
  normalMatrix: mat4x4f,
  color: vec4f,
};

@group(${SHADER_BIND_GROUP.frame}) @binding(${SHADER_BINDING.uniforms})
var<uniform> uFrame: FrameUniforms;
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.uniforms})
var<uniform> uObject: ObjectUniforms;

struct VertexIn {
  @location(${VERTEX_ATTRIBUTE.position}) position: vec3f,
  @location(${VERTEX_ATTRIBUTE.normal}) normal: vec3f,
  @location(${VERTEX_ATTRIBUTE.uv}) uv: vec2f,
};

// Shading happens in linear space (colors are decoded by the renderer,
// texture samples by their '-srgb' format); this encodes the finished
// color for the non-sRGB swap chain. Fragment shaders end with it.
fn linearToSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

// Ambient + the directional light + the point lights on a diffuse
// surface, in linear space. Lit fragment shaders multiply the surface
// color by this.
fn diffuseLighting(n: vec3f, worldPosition: vec3f) -> vec3f {
  var lighting = uFrame.ambientColor;
  let toLight = normalize(-uFrame.lightDirection);
  lighting += max(dot(n, toLight), 0.0) * uFrame.lightColor;
  let count = u32(uFrame.pointLightCount);
  for (var i = 0u; i < count; i++) {
    let offset = uFrame.pointLights[i].position - worldPosition;
    let distanceSq = max(dot(offset, offset), 1e-6);
    // 1 / (1 + d^2) falloff: intensity is the brightness right at the
    // light, fading smoothly and never blowing up at zero distance.
    let attenuation = 1.0 / (1.0 + distanceSq);
    let direction = offset * inverseSqrt(distanceSq);
    lighting += max(dot(n, direction), 0.0) * attenuation
      * uFrame.pointLights[i].color;
  }
  return lighting;
}
`;
