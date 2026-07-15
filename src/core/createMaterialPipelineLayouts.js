import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
  SHADOW_BINDING,
} from './pipelineConstants.js';

/**
 * Creates the bind-group and pipeline layouts shared by the material system.
 * The 2D and 3D engines differ only in which stages can read frame uniforms.
 * `label` prefixes every layout's label so validation errors name the engine
 * that owns the object.
 */
export function createMaterialPipelineLayouts(
  device,
  frameVisibility,
  { shadows = false, label = 'Material' } = {},
) {
  const objectVisibility =
    GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

  const frameBindGroupLayout = device.createBindGroupLayout({
    label: `${label} frame uniforms layout`,
    entries: [
      {
        binding: SHADER_BINDING.uniforms,
        visibility: frameVisibility,
        buffer: {},
      },
    ],
  });

  const objectBindGroupLayout = device.createBindGroupLayout({
    label: `${label} object uniforms layout`,
    entries: [
      {
        binding: SHADER_BINDING.uniforms,
        visibility: objectVisibility,
        buffer: {},
      },
    ],
  });

  const texturedObjectBindGroupLayout = device.createBindGroupLayout({
    label: `${label} textured object uniforms layout`,
    entries: [
      {
        binding: SHADER_BINDING.uniforms,
        visibility: objectVisibility,
        buffer: {},
      },
      {
        binding: SHADER_BINDING.map,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
      {
        binding: SHADER_BINDING.sampler,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {},
      },
    ],
  });

  const shadowBindGroupLayout = shadows
    ? device.createBindGroupLayout({
        label: `${label} shadow sampling layout`,
        entries: [
          {
            binding: SHADOW_BINDING.uniforms,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: {},
          },
          {
            binding: SHADOW_BINDING.map,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'depth' },
          },
          {
            binding: SHADOW_BINDING.sampler,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: 'comparison' },
          },
        ],
      })
    : null;

  return {
    frameBindGroupLayout,
    objectBindGroupLayout,
    texturedObjectBindGroupLayout,
    shadowBindGroupLayout,
    pipelineLayout: createPipelineLayout(
      device,
      `${label} pipeline layout`,
      frameBindGroupLayout,
      objectBindGroupLayout,
      shadowBindGroupLayout,
    ),
    texturedPipelineLayout: createPipelineLayout(
      device,
      `${label} textured pipeline layout`,
      frameBindGroupLayout,
      texturedObjectBindGroupLayout,
      shadowBindGroupLayout,
    ),
  };
}

function createPipelineLayout(
  device,
  label,
  frameLayout,
  objectLayout,
  shadowLayout,
) {
  const bindGroupLayouts = [];
  bindGroupLayouts[SHADER_BIND_GROUP.frame] = frameLayout;
  bindGroupLayouts[SHADER_BIND_GROUP.object] = objectLayout;
  if (shadowLayout) {
    bindGroupLayouts[SHADER_BIND_GROUP.shadow] = shadowLayout;
  }
  return device.createPipelineLayout({ label, bindGroupLayouts });
}
