// WebGPU has no built-in mipmap generation, so we do the standard
// trick: for each mip level, run a tiny render pass that draws a
// fullscreen triangle sampling the previous level with linear
// filtering. The pipeline is created once per device and cached.

import { SHADER_ENTRY_POINT } from './pipelineConstants.js';

const MIPMAP_BIND_GROUP = 0;
const MIPMAP_BINDING = Object.freeze({
  source: 0,
  sampler: 1,
});

const MIPMAP_WGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

// One triangle that covers the whole target: uvs (0,0) (2,0) (0,2)
// mapped so uv (0,0) lands on the destination's top-left texel.
@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  var out: VertexOut;
  let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  out.position = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@group(${MIPMAP_BIND_GROUP}) @binding(${MIPMAP_BINDING.source})
var src: texture_2d<f32>;
@group(${MIPMAP_BIND_GROUP}) @binding(${MIPMAP_BINDING.sampler})
var srcSampler: sampler;

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return textureSample(src, srcSampler, input.uv);
}
`;

// device -> { module, sampler, pipelines: Map(texture format -> pipeline) }
const generators = new WeakMap();

/** Mip levels needed to take a width x height image down to 1x1. */
export function mipLevelCount(width, height) {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/**
 * Fills mip levels 1..levels-1 of `texture` (a GPUTexture of the given
 * format whose level 0 is already written) by downsampling level by
 * level. The texture must have TEXTURE_BINDING and RENDER_ATTACHMENT
 * usage — the ones uploadTexture creates already do. For an '-srgb'
 * format the samples decode to linear and the render target re-encodes,
 * so the filtering itself happens in linear space.
 */
export function generateMipmaps(device, texture, levels, format) {
  let generator = generators.get(device);
  if (!generator) {
    generator = {
      module: device.createShaderModule({ code: MIPMAP_WGSL }),
      sampler: device.createSampler({ minFilter: 'linear' }),
      pipelines: new Map(),
    };
    generators.set(device, generator);
  }
  let pipeline = generator.pipelines.get(format);
  if (!pipeline) {
    pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: generator.module,
        entryPoint: SHADER_ENTRY_POINT.vertex,
      },
      fragment: {
        module: generator.module,
        entryPoint: SHADER_ENTRY_POINT.fragment,
        targets: [{ format }],
      },
    });
    generator.pipelines.set(format, pipeline);
  }

  const encoder = device.createCommandEncoder();
  for (let level = 1; level < levels; level++) {
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: MIPMAP_BINDING.source,
          resource: texture.createView({
            baseMipLevel: level - 1,
            mipLevelCount: 1,
          }),
        },
        { binding: MIPMAP_BINDING.sampler, resource: generator.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(MIPMAP_BIND_GROUP, bindGroup);
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}
