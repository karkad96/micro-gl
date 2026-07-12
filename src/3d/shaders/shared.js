import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
  SHADOW_BINDING,
} from '../../core/pipelineConstants.js';
import { VERTEX_ATTRIBUTE } from './vertexLayout.js';
import { MAX_POINT_LIGHTS } from '../constants.js';

export { MAX_POINT_LIGHTS };

/** Object-uniform layout shared by color and shadow-depth shader modules. */
export const OBJECT_UNIFORM_WGSL = /* wgsl */ `
struct ObjectUniforms {
  model: mat4x4f,
  normalMatrix: mat4x4f,
  color: vec4f,
  // x: whether this mesh receives the directional shadow.
  shadowFlags: vec4f,
};
`;

/** Directional-shadow uniform layout shared by both render passes. */
export const SHADOW_UNIFORM_WGSL = /* wgsl */ `
struct ShadowUniforms {
  viewProjection: mat4x4f,
  // x: enabled, y: depth bias, z: normal bias, w: shadow texel size.
  params: vec4f,
};
`;

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

${OBJECT_UNIFORM_WGSL}
${SHADOW_UNIFORM_WGSL}

@group(${SHADER_BIND_GROUP.frame}) @binding(${SHADER_BINDING.uniforms})
var<uniform> uFrame: FrameUniforms;
@group(${SHADER_BIND_GROUP.object}) @binding(${SHADER_BINDING.uniforms})
var<uniform> uObject: ObjectUniforms;
@group(${SHADER_BIND_GROUP.shadow}) @binding(${SHADOW_BINDING.uniforms})
var<uniform> uShadow: ShadowUniforms;
@group(${SHADER_BIND_GROUP.shadow}) @binding(${SHADOW_BINDING.map})
var uShadowMap: texture_depth_2d;
@group(${SHADER_BIND_GROUP.shadow}) @binding(${SHADOW_BINDING.sampler})
var uShadowSampler: sampler_comparison;

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

// Returns the fraction of the 3x3 comparison-filter kernel that can see the
// directional light. Coordinates outside the configured shadow camera stay
// fully lit rather than clamping to the map's edge.
fn directionalShadow(n: vec3f, worldPosition: vec3f) -> f32 {
  if (uShadow.params.x < 0.5 || uObject.shadowFlags.x < 0.5) {
    return 1.0;
  }

  let biasedPosition = worldPosition + n * uShadow.params.z;
  let clip = uShadow.viewProjection * vec4f(biasedPosition, 1.0);
  if (clip.w <= 0.0) {
    return 1.0;
  }

  let ndc = clip.xyz / clip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (
    uv.x < 0.0 || uv.x > 1.0 ||
    uv.y < 0.0 || uv.y > 1.0 ||
    ndc.z < 0.0 || ndc.z > 1.0
  ) {
    return 1.0;
  }

  let referenceDepth = ndc.z - uShadow.params.y;
  var visibility = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let offset = vec2f(f32(x), f32(y)) * uShadow.params.w;
      visibility += textureSampleCompareLevel(
        uShadowMap,
        uShadowSampler,
        uv + offset,
        referenceDepth,
      );
    }
  }
  return visibility / 9.0;
}

// Ambient + the directional light + the point lights on a diffuse
// surface, in linear space. Lit fragment shaders multiply the surface
// color by this.
fn diffuseLighting(n: vec3f, worldPosition: vec3f) -> vec3f {
  var lighting = uFrame.ambientColor;
  let toLight = normalize(-uFrame.lightDirection);
  let shadow = directionalShadow(n, worldPosition);
  lighting += max(dot(n, toLight), 0.0) * uFrame.lightColor * shadow;
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
