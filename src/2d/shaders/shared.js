import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
} from '../../core/pipelineConstants.js';
import { VERTEX_ATTRIBUTE_2D } from './vertexLayout.js';

/** Uniform declarations shared by every 2D shader. */
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

`;
