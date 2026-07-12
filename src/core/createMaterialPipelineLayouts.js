import {
  SHADER_BIND_GROUP,
  SHADER_BINDING,
} from './pipelineConstants.js';

/**
 * Creates the bind-group and pipeline layouts shared by the material system.
 * The 2D and 3D engines differ only in which stages can read frame uniforms.
 */
export function createMaterialPipelineLayouts(device, frameVisibility) {
  const objectVisibility =
    GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

  const frameBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: SHADER_BINDING.uniforms,
        visibility: frameVisibility,
        buffer: {},
      },
    ],
  });

  const objectBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: SHADER_BINDING.uniforms,
        visibility: objectVisibility,
        buffer: {},
      },
    ],
  });

  const texturedObjectBindGroupLayout = device.createBindGroupLayout({
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

  return {
    frameBindGroupLayout,
    objectBindGroupLayout,
    texturedObjectBindGroupLayout,
    pipelineLayout: createPipelineLayout(
      device,
      frameBindGroupLayout,
      objectBindGroupLayout,
    ),
    texturedPipelineLayout: createPipelineLayout(
      device,
      frameBindGroupLayout,
      texturedObjectBindGroupLayout,
    ),
  };
}

function createPipelineLayout(device, frameLayout, objectLayout) {
  const bindGroupLayouts = [];
  bindGroupLayouts[SHADER_BIND_GROUP.frame] = frameLayout;
  bindGroupLayouts[SHADER_BIND_GROUP.object] = objectLayout;
  return device.createPipelineLayout({ bindGroupLayouts });
}
