/**
 * Requests the GPU adapter/device and configures the canvas for WebGPU.
 * Shared by Renderer (3D) and Renderer2d so both engines can drive the
 * same canvas: a canvas context can only be configured for one device,
 * so two renderers on one canvas must share the result of a single
 * initWebGpu call (see `renderer.init(shared)`).
 *
 * @returns {Promise<{device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat}>}
 */
export async function initWebGpu(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser.');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No suitable GPU adapter found.');
  }
  const device = await adapter.requestDevice();

  // Driver resets and GPU-process crashes otherwise freeze rendering
  // silently; say what happened and how to recover. 'destroyed' is the
  // deliberate renderer.dispose() path, not a failure.
  device.lost.then((info) => {
    if (info.reason !== 'destroyed') {
      console.error(
        `micro-gl: GPU device lost (${info.reason || 'unknown'}): ` +
          `${info.message} Rendering has stopped. To recover, create and ` +
          'initialize a new Renderer, and dispose() your scene objects, ' +
          'geometries and textures so their GPU state re-uploads.',
      );
    }
  });

  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  });

  return { device, context, format };
}
