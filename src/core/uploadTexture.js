import { generateMipmaps, mipLevelCount } from './generateMipmaps.js';

/**
 * GPU texture, view and sampler for a Texture, uploaded on first use
 * and cached on `texture._gpu`. Shared by GpuResources and
 * GpuResources2d — texture upload is device-level plumbing, identical
 * for both engines (which is also why one Texture can be shared by
 * renderers that share a device).
 */
export function uploadTexture(device, texture) {
  if (!texture._gpu) {
    const size = [texture.width, texture.height];
    const levels = texture.mipmaps
      ? mipLevelCount(texture.width, texture.height)
      : 1;
    const gpuTexture = device.createTexture({
      size,
      mipLevelCount: levels,
      format: 'rgba8unorm',
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
    if (levels > 1) generateMipmaps(device, gpuTexture, levels);
    const sampler = device.createSampler({
      magFilter: texture.magFilter,
      minFilter: texture.minFilter,
      mipmapFilter: texture.mipmaps ? 'linear' : 'nearest',
      addressModeU: texture.addressModeU,
      addressModeV: texture.addressModeV,
    });
    texture._gpu = {
      texture: gpuTexture,
      view: gpuTexture.createView(),
      sampler,
    };
  }
  return texture._gpu;
}
