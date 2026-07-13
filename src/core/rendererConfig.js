import { srgbToLinear } from '../math/color.js';

/** Shared renderer defaults and WebGPU attachment formats. */
export const DEFAULT_CANVAS_WIDTH = 300;
export const DEFAULT_CANVAS_HEIGHT = 150;
export const MAX_PIXEL_RATIO = 2;
export const ANTIALIAS_SAMPLE_COUNT = 4;
export const SINGLE_SAMPLE_COUNT = 1;
export const DEPTH_FORMAT = 'depth24plus';
export const DEPTH_CLEAR_VALUE = 1;

/** Returns the sRGB view format compatible with a preferred canvas format. */
export function srgbColorFormat(canvasFormat) {
  switch (canvasFormat) {
    case 'bgra8unorm':
      return 'bgra8unorm-srgb';
    case 'rgba8unorm':
      return 'rgba8unorm-srgb';
    default:
      throw new Error(`Unsupported canvas format: ${canvasFormat}`);
  }
}

/** Decodes an authored sRGB clear color for an sRGB render attachment. */
export function linearClearColor(color) {
  return [
    srgbToLinear(color[0]),
    srgbToLinear(color[1]),
    srgbToLinear(color[2]),
    color[3],
  ];
}

/** Returns a bounded device-pixel ratio that is also safe in test environments. */
export function getPixelRatio() {
  return Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

/** Converts CSS dimensions into a valid WebGPU drawing-buffer extent. */
export function drawingBufferSize(width, height) {
  const pixelRatio = getPixelRatio();
  return {
    width: Math.max(1, Math.floor(width * pixelRatio)),
    height: Math.max(1, Math.floor(height * pixelRatio)),
  };
}

/** Builds the color attachment shared by both renderers. */
export function colorAttachment(msaaView, swapView, clearValue) {
  if (!msaaView) {
    return {
      view: swapView,
      clearValue,
      loadOp: 'clear',
      storeOp: 'store',
    };
  }
  return {
    view: msaaView,
    resolveTarget: swapView,
    clearValue,
    loadOp: 'clear',
    // Only the resolved image reaches the canvas.
    storeOp: 'discard',
  };
}
