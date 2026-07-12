/**
 * Requests the GPU adapter/device and configures the canvas for WebGPU.
 * Shared by Renderer (3D) and Renderer2d so both engines can drive the
 * same canvas: a canvas context can only be configured for one device,
 * so two renderers on one canvas must share the result of a single
 * initWebGpu call (see `renderer.init(shared)`).
 *
 * @returns {Promise<{device: GPUDevice, context: GPUCanvasContext,
 *   format: GPUTextureFormat, canvas: HTMLCanvasElement}>}
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
  let context = null;
  try {
    context = canvas.getContext('webgpu');
    if (!context) throw new Error('Could not create a WebGPU canvas context.');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    });

    // Driver resets and GPU-process crashes otherwise freeze rendering
    // silently; say what happened and how to recover. 'destroyed' is the
    // deliberate renderer.dispose() path, not a failure.
    device.lost.then((info) => {
      if (info.reason !== 'destroyed') {
        console.error(
          `micro-gl: GPU device lost (${info.reason || 'unknown'}): ` +
            `${info.message} Rendering has stopped. To recover, create and ` +
            'initialize a new Renderer; scene resources upload ' +
            'automatically when first drawn on the replacement device.',
        );
      }
    });

    return { device, context, format, canvas };
  } catch (error) {
    // A device was already allocated, so canvas-setup failure must not leak it.
    try {
      if (context) context.unconfigure();
    } catch {
      // Preserve the original setup error if the context also rejects cleanup.
    }
    device.destroy();
    throw error;
  }
}
