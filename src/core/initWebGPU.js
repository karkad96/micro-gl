/**
 * Requests the GPU adapter/device and configures the canvas for WebGPU.
 * Shared by Renderer (3D) and Renderer2D so both engines can drive the
 * same canvas: a canvas context can only be configured for one device,
 * so two renderers on one canvas must share the result of a single
 * initWebGPU call (see `renderer.init(shared)`).
 *
 * @returns {Promise<{device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat}>}
 */
export async function initWebGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser.');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No suitable GPU adapter found.');
  }
  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  });

  return { device, context, format };
}
