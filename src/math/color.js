/**
 * sRGB <-> linear conversion for a single color channel (the exact
 * piecewise curves, matching what the GPU applies to '-srgb' texture
 * formats).
 *
 * The engine's color convention: the colors you author — material,
 * light and instance colors, 0..1 — are sRGB display values, the same
 * values you would type into a CSS color. The renderer decodes them to
 * linear before uploading, all shading happens in linear space, and
 * the fragment shaders encode the result back to sRGB for the swap
 * chain (see linearToSrgb in Material / Material2d's WGSL).
 */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** The inverse of srgbToLinear. */
export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}
