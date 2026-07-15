import { generateMipmaps, mipLevelCount } from './generateMipmaps.js';

const SRGB_TEXTURE_FORMAT = 'rgba8unorm-srgb';
const LINEAR_TEXTURE_FORMAT = 'rgba8unorm';

/**
 * GPU texture, view and sampler for a Texture, uploaded on first use
 * and cached per GPUDevice on `texture._gpu`. Shared by GpuResources and
 * GpuResources2d — texture upload is device-level plumbing, identical
 * for both engines. A Texture can therefore be used by renderers on the
 * same device or on independent devices.
 */
export function uploadTexture(device, texture) {
  const cache = texture._gpu || (texture._gpu = new Map());
  let gpu = cache.get(device);

  if (!gpu) {
    const size = [texture.width, texture.height];
    const levels = texture.mipmaps
      ? mipLevelCount(texture.width, texture.height)
      : 1;
    // An sRGB format makes the GPU decode samples to linear (and
    // re-encode when the mipmap pass renders into a level), so shading
    // and mip filtering happen in linear space.
    const format = texture.srgb ? SRGB_TEXTURE_FORMAT : LINEAR_TEXTURE_FORMAT;
    const gpuTexture = device.createTexture({
      label: `Texture ${texture.width}x${texture.height}`,
      size,
      mipLevelCount: levels,
      format,
      // copyExternalImageToTexture requires RENDER_ATTACHMENT usage.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source: texture.source, flipY: texture.flipY },
      { texture: gpuTexture },
      size,
    );
    if (levels > 1) generateMipmaps(device, gpuTexture, levels, format);
    const sampler = device.createSampler({
      label: 'Texture sampler',
      magFilter: texture.magFilter,
      minFilter: texture.minFilter,
      mipmapFilter: texture.mipmaps ? 'linear' : 'nearest',
      addressModeU: texture.addressModeU,
      addressModeV: texture.addressModeV,
    });
    gpu = {
      texture: gpuTexture,
      view: gpuTexture.createView(),
      sampler,
    };
    cache.set(device, gpu);
  }
  return gpu;
}
