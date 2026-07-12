/**
 * An image a shader can sample, plus its sampler settings — plain data,
 * like geometries and materials. Assign one to a material's `map` and
 * the renderer uploads it lazily on first draw (see GpuResources /
 * GpuResources2d, which cache the GPU side on `_gpu`).
 *
 * `source` is anything copyExternalImageToTexture accepts: an
 * ImageBitmap, HTMLCanvasElement, OffscreenCanvas or HTMLImageElement.
 * Use `Texture.load(url)` to get one from an image file.
 *
 * The GPU texture belongs to whichever device first draws it, so one
 * Texture can be shared by renderers that share a device (like a 3D and
 * a 2D renderer on the same canvas), but not across devices.
 */
export class Texture {
  /**
   * @param {ImageBitmap|HTMLCanvasElement|OffscreenCanvas|HTMLImageElement} source
   * @param {object} [options]
   * @param {GPUFilterMode}  [options.magFilter]    'linear' (default) or 'nearest'
   * @param {GPUFilterMode}  [options.minFilter]    'linear' (default) or 'nearest'
   * @param {GPUAddressMode} [options.addressModeU] 'clamp-to-edge' (default),
   *   'repeat' or 'mirror-repeat' — what happens outside 0..1 UVs
   * @param {GPUAddressMode} [options.addressModeV] same, for v
   * @param {boolean} [options.flipY] flip the image vertically on upload;
   *   useful when a geometry's v axis points up (e.g. RectGeometry) so
   *   images would otherwise appear upside down
   * @param {boolean} [options.mipmaps] generate a full mip chain on
   *   upload (default true) so minified sampling doesn't alias; turn
   *   off for textures that never shrink on screen (UI, full-screen)
   * @param {boolean} [options.srgb] the image holds sRGB-encoded colors
   *   (default true — the normal case for pictures): the GPU decodes
   *   samples to linear for shading, and mipmaps are filtered in linear
   *   space. Turn off for data textures whose values aren't colors
   */
  constructor(
    source,
    {
      magFilter = 'linear',
      minFilter = 'linear',
      addressModeU = 'clamp-to-edge',
      addressModeV = 'clamp-to-edge',
      flipY = false,
      mipmaps = true,
      srgb = true,
    } = {},
  ) {
    this.source = source;
    this.magFilter = magFilter;
    this.minFilter = minFilter;
    this.addressModeU = addressModeU;
    this.addressModeV = addressModeV;
    this.flipY = flipY;
    this.mipmaps = mipmaps;
    this.srgb = srgb;
    this._gpu = null;
  }

  get width() {
    return this.source.width;
  }

  get height() {
    return this.source.height;
  }

  /**
   * Destroys the uploaded GPU texture (if any), releasing its memory
   * right away instead of waiting for GC. The next draw that samples
   * this Texture uploads it again, and meshes/shapes using it rebuild
   * their bind groups automatically.
   */
  dispose() {
    if (this._gpu) {
      this._gpu.texture.destroy();
      this._gpu = null;
    }
    return this;
  }

  /** Fetches an image file and wraps it in a Texture. */
  static async load(url, options) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Texture.load: ${url} responded ${response.status}`);
    }
    const bitmap = await createImageBitmap(await response.blob());
    return new Texture(bitmap, options);
  }
}
