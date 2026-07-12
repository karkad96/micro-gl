import { Shape2d } from './Shape2d.js';
import { GpuResources2d } from './GpuResources2d.js';
import { initWebGpu } from '../../core/initWebGpu.js';
import { srgbToLinear } from '../../math/color.js';

// FrameUniforms: one mat3x3f (48 bytes, columns padded to 16 bytes),
// matching the WGSL struct in Material2d.js. Mat3.elements already uses
// this layout, so the camera matrix is uploaded directly.
const FRAME_UNIFORM_SIZE = 48;

// Float offsets of the ObjectUniforms fields, matching the WGSL struct
// in Material2d.js (a mat3x3f — 12 floats with padding — then a vec4f).
const TRANSFORM = 0;
const OBJECT_COLOR = 12;

/**
 * The 2D renderer. Same shape as the 3D Renderer — one render pass,
 * lazy GPU resources — but with everything a flat scene doesn't need
 * removed: there is no depth buffer. Draw order comes from sorting
 * shapes by `zIndex` (painter's algorithm) and alpha blending is on,
 * so transparent shapes work out of the box.
 *
 * Usage:
 *   const renderer2d = new Renderer2d(canvas);
 *   await renderer2d.init();
 *   renderer2d.render(scene2d, camera2d);
 *
 * To share a canvas with a 3D Renderer, initialize one of them first
 * and pass it to the other's `init` so they use the same GPU device:
 *   await renderer2d.init(renderer3d);
 */
export class Renderer2d {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {boolean} [options.autoResize] follow the canvas's CSS size
   *   with a ResizeObserver, calling setSize automatically (default
   *   false — call setSize yourself)
   * @param {boolean} [options.antialias] draw into a 4x multisampled
   *   target that resolves to the canvas (default true), smoothing
   *   edges; set false to render aliased at slightly lower cost
   */
  constructor(canvas, { autoResize = false, antialias = true } = {}) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.format = null;
    /** How many shapes the last render() call drew. */
    this.drawCount = 0;

    this._autoResize = autoResize;
    this._sampleCount = antialias ? 4 : 1;
    this._resizeObserver = null;
    this._ownsDevice = false;
    this._resources = null;
    this._msaaTexture = null;
    this._msaaView = null;
    this._drawList = [];
  }

  /**
   * Requests the adapter/device and configures the canvas. Must be
   * awaited before rendering. Pass another already-initialized renderer
   * on the same canvas as `shared` to reuse its GPU device.
   *
   * @param {{device, context, format}} [shared]
   */
  async init(shared) {
    this._ownsDevice = !shared;
    const gpu = shared || (await initWebGpu(this.canvas));
    this.device = gpu.device;
    this.context = gpu.context;
    this.format = gpu.format;

    this._resources = new GpuResources2d(
      this.device,
      this.format,
      this._sampleCount,
    );

    this._frameUniformBuffer = this.device.createBuffer({
      size: FRAME_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._frameBindGroup = this.device.createBindGroup({
      layout: this._resources.frameBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._frameUniformBuffer } }],
    });

    this.setSize(
      this.canvas.clientWidth || 300,
      this.canvas.clientHeight || 150,
    );
    if (this._autoResize && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) this.setSize(width, height);
      });
      this._resizeObserver.observe(this.canvas);
    }
    return this;
  }

  /** Resizes the drawing buffer. Pass CSS pixel dimensions. */
  setSize(width, height) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(height * pixelRatio));

    if (!this.device) return;
    if (this._msaaTexture) this._msaaTexture.destroy();
    this._msaaTexture = null;
    this._msaaView = null;
    if (this._sampleCount > 1) {
      // The multisampled color target the pass draws into; it resolves
      // to the swap chain texture at the end of every render pass.
      this._msaaTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: this.format,
        sampleCount: this._sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this._msaaView = this._msaaTexture.createView();
    }
  }

  /** Draws one frame of `scene` as seen from `camera`. */
  render(scene, camera) {
    camera.aspect = this.canvas.width / this.canvas.height;

    scene.updateWorldMatrix();
    camera.updateMatrices();

    this.device.queue.writeBuffer(
      this._frameUniformBuffer,
      0,
      camera.viewProjectionMatrix.elements,
    );

    // Painter's algorithm: collect visible shapes and draw them
    // back-to-front. sort() is stable, so equal zIndex keeps scene order.
    const drawList = this._drawList;
    drawList.length = 0;
    scene.traverseVisible((object) => {
      if (object instanceof Shape2d) {
        drawList.push(object);
      }
    });
    drawList.sort((a, b) => a.zIndex - b.zIndex);
    let drawCount = 0;
    for (const shape of drawList) {
      drawCount += shape.isInstanced ? shape.count : 1;
    }
    this.drawCount = drawCount;

    const encoder = this.device.createCommandEncoder();
    const swapView = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        this._msaaView
          ? {
              view: this._msaaView,
              // The resolved copy is what reaches the screen; the raw
              // samples aren't needed after the pass, so discard them.
              resolveTarget: swapView,
              clearValue: scene.background,
              loadOp: 'clear',
              storeOp: 'discard',
            }
          : {
              view: swapView,
              clearValue: scene.background,
              loadOp: 'clear',
              storeOp: 'store',
            },
      ],
    });

    pass.setBindGroup(0, this._frameBindGroup);
    for (const shape of drawList) {
      this._drawShape(pass, shape);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Releases everything the renderer itself owns: the resize observer,
   * the frame uniform buffer and — when this renderer created the GPU
   * device rather than sharing one via init(shared) — the device
   * itself. Per-object GPU state lives on the scene objects; release
   * it with object.dispose(), geometry.dispose() and
   * texture.dispose(). The renderer cannot be used after this.
   */
  dispose() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._frameUniformBuffer) this._frameUniformBuffer.destroy();
    if (this._msaaTexture) this._msaaTexture.destroy();
    this._frameUniformBuffer = null;
    this._msaaTexture = null;
    this._msaaView = null;
    if (this._ownsDevice && this.device) {
      this.context.unconfigure();
      this.device.destroy();
    }
    this.device = null;
    this.context = null;
  }

  _drawShape(pass, shape) {
    const instanced = !!shape.isInstanced;
    const geometryGPU = this._resources.geometryFor(shape.geometry);
    const shapeGPU = this._resources.shapeFor(shape);
    const pipeline = this._resources.pipelineFor(shape.material, instanced);

    // Per-object uniforms: world transform, color.
    const data = shapeGPU.data;
    data.set(shape.worldMatrix.elements, TRANSFORM);
    const color = shape.material.color;
    // Colors are authored in sRGB; the shader shades in linear space
    // and encodes back at the end.
    data[OBJECT_COLOR] = srgbToLinear(color[0]);
    data[OBJECT_COLOR + 1] = srgbToLinear(color[1]);
    data[OBJECT_COLOR + 2] = srgbToLinear(color[2]);
    data[OBJECT_COLOR + 3] = color.length > 3 ? color[3] : 1;
    this.device.queue.writeBuffer(shapeGPU.uniformBuffer, 0, data);

    pass.setPipeline(pipeline);
    pass.setBindGroup(1, shapeGPU.bindGroup);
    pass.setVertexBuffer(0, geometryGPU.vertexBuffer);
    if (instanced) {
      if (shape.needsUpdate) {
        this.device.queue.writeBuffer(
          shapeGPU.instanceBuffer,
          0,
          shape.instanceData,
        );
        shape.needsUpdate = false;
      }
      pass.setVertexBuffer(1, shapeGPU.instanceBuffer);
    }
    pass.setIndexBuffer(geometryGPU.indexBuffer, 'uint32');
    pass.drawIndexed(shape.geometry.indexCount, instanced ? shape.count : 1);
  }
}
