// WebGPU has no built-in mipmap generation, so we do the standard
// trick: for each mip level, run a tiny render pass that draws a
// fullscreen triangle sampling the previous level with linear
// filtering. The pipeline is created once per device and cached.

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

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return textureSample(src, srcSampler, input.uv);
}
`;

const generators = new WeakMap(); // device -> { pipeline, sampler }

/** Mip levels needed to take a width x height image down to 1x1. */
export function mipLevelCount(width, height) {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/**
 * Fills mip levels 1..levels-1 of `texture` (an rgba8unorm GPUTexture
 * whose level 0 is already written) by downsampling level by level.
 * The texture must have TEXTURE_BINDING and RENDER_ATTACHMENT usage —
 * the ones GpuResources creates already do.
 */
export function generateMipmaps(device, texture, levels) {
  let generator = generators.get(device);
  if (!generator) {
    const module = device.createShaderModule({ code: MIPMAP_WGSL });
    generator = {
      pipeline: device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{ format: 'rgba8unorm' }],
        },
      }),
      sampler: device.createSampler({ minFilter: 'linear' }),
    };
    generators.set(device, generator);
  }

  const encoder = device.createCommandEncoder();
  for (let level = 1; level < levels; level++) {
    const bindGroup = device.createBindGroup({
      layout: generator.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: texture.createView({
            baseMipLevel: level - 1,
            mipLevelCount: 1,
          }),
        },
        { binding: 1, resource: generator.sampler },
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
    pass.setPipeline(generator.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}
