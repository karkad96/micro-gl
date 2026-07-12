import { Shape2d } from './Shape2d.js';
import { GpuResources2d } from './GpuResources2d.js';
import {
  FRAME_UNIFORM_SIZE_2D,
  OBJECT_UNIFORM_OFFSET_2D,
} from './Uniforms2d.js';
import { initWebGpu } from '../../core/initWebGpu.js';
import { srgbToLinear } from '../../math/color.js';
import {
  ANTIALIAS_SAMPLE_COUNT,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  SINGLE_SAMPLE_COUNT,
  colorAttachment,
  drawingBufferSize,
} from '../../core/rendererConfig.js';
import {
  acquireDeviceLease,
  releaseDeviceLease,
} from '../../core/deviceLease.js';
import {
  INDEX_FORMAT,
  SHADER_BIND_GROUP,
  SHADER_BINDING,
  VERTEX_BUFFER_SLOT,
} from '../../core/pipelineConstants.js';

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
    this._sampleCount = antialias
      ? ANTIALIAS_SAMPLE_COUNT
      : SINGLE_SAMPLE_COUNT;
    this._resizeObserver = null;
    this._ownsDevice = false;
    this._deviceLease = null;
    this._initPromise = null;
    this._initVersion = 0;
    this._resources = null;
    this._msaaTexture = null;
    this._msaaView = null;
    this._targetWidth = 0;
    this._targetHeight = 0;
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
    // Coalesce overlapping calls so one canvas is never configured with two
    // newly requested devices. Both callers observe the same result.
    if (this._initPromise) return this._initPromise;
    if (this.device) throw new Error('Renderer2d is already initialized');

    const version = ++this._initVersion;
    const initialization = this._completeInitialization(shared, version);
    this._initPromise = initialization;
    try {
      return await initialization;
    } finally {
      if (this._initPromise === initialization) {
        this._initPromise = null;
      }
    }
  }

  async _completeInitialization(shared, version) {
    const renderer = await this._initialize(shared, version);
    if (version !== this._initVersion) {
      throw new Error(
        'Renderer2d initialization was cancelled by dispose()',
      );
    }
    return renderer;
  }

  async _initialize(shared, version) {
    const gpu = shared || (await initWebGpu(this.canvas));
    if (version !== this._initVersion) {
      if (!shared) {
        gpu.context.unconfigure();
        gpu.device.destroy();
      }
      throw new Error(
        'Renderer2d initialization was cancelled by dispose()',
      );
    }

    let leaseAcquired = false;
    try {
      const lease = acquireDeviceLease(this, gpu, shared);
      leaseAcquired = true;
      this.device = lease.device;
      this.context = lease.context;
      this.format = lease.format;

      this._resources = new GpuResources2d(
        this.device,
        this.format,
        this._sampleCount,
      );

      this._frameUniformBuffer = this.device.createBuffer({
        size: FRAME_UNIFORM_SIZE_2D,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this._frameBindGroup = this.device.createBindGroup({
        layout: this._resources.frameBindGroupLayout,
        entries: [
          {
            binding: SHADER_BINDING.uniforms,
            resource: { buffer: this._frameUniformBuffer },
          },
        ],
      });

      this.setSize(
        this.canvas.clientWidth || DEFAULT_CANVAS_WIDTH,
        this.canvas.clientHeight || DEFAULT_CANVAS_HEIGHT,
      );
      if (this._autoResize && typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver((entries) => {
          const { width, height } = entries[0].contentRect;
          if (width > 0 && height > 0) this.setSize(width, height);
        });
        this._resizeObserver.observe(this.canvas);
      }
      return this;
    } catch (error) {
      if (leaseAcquired) {
        this.dispose();
      } else if (!shared) {
        gpu.context.unconfigure();
        gpu.device.destroy();
      }
      throw error;
    }
  }

  /** Resizes the drawing buffer. Pass CSS pixel dimensions. */
  setSize(width, height) {
    const size = drawingBufferSize(width, height);
    this.canvas.width = size.width;
    this.canvas.height = size.height;

    if (!this.device) return;
    this._recreateRenderTargets();
  }

  /** Keeps MSAA valid when another renderer resized a shared canvas. */
  _ensureRenderTargets() {
    const sizeChanged =
      this._targetWidth !== this.canvas.width ||
      this._targetHeight !== this.canvas.height;
    const attachmentMissing = this._sampleCount > 1 && !this._msaaTexture;
    if (sizeChanged || attachmentMissing) this._recreateRenderTargets();
  }

  _recreateRenderTargets() {
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
    this._targetWidth = this.canvas.width;
    this._targetHeight = this.canvas.height;
  }

  /** Draws one frame of `scene` as seen from `camera`. */
  render(scene, camera) {
    if (!this.device) {
      throw new Error('Renderer2d.init() must complete before render()');
    }
    this._ensureRenderTargets();
    camera.aspect = this.canvas.width / this.canvas.height;

    scene.updateWorldMatrix();
    camera.updateMatrices();

    this.device.queue.writeBuffer(
      this._frameUniformBuffer,
      0,
      camera.viewProjectionMatrix.elements,
    );

    const drawList = this._collectShapes(scene);

    const encoder = this.device.createCommandEncoder();
    const pass = this._beginRenderPass(encoder, scene.background);

    pass.setBindGroup(SHADER_BIND_GROUP.frame, this._frameBindGroup);
    for (const shape of drawList) {
      this._drawShape(pass, shape);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** Collects visible shapes in painter's-algorithm order. */
  _collectShapes(scene) {
    const drawList = this._drawList;
    drawList.length = 0;
    scene.traverseVisible((object) => {
      if (object instanceof Shape2d) drawList.push(object);
    });
    // sort() is stable, so equal zIndex values preserve scene order.
    drawList.sort((a, b) => a.zIndex - b.zIndex);
    this.drawCount = drawList.reduce(
      (count, shape) => count + (shape.isInstanced ? shape.count : 1),
      0,
    );
    return drawList;
  }

  _beginRenderPass(encoder, background) {
    const swapView = this.context.getCurrentTexture().createView();
    return encoder.beginRenderPass({
      colorAttachments: [colorAttachment(this._msaaView, swapView, background)],
    });
  }

  /**
   * Releases the resize observer, frame buffer, render targets and this
   * renderer's per-object buffers. A
   * managed shared device stays alive until the last renderer using it
   * is disposed. Geometry and texture caches may be shared; release those
   * separately with geometry.dispose() and texture.dispose(). Call init()
   * again before reusing this renderer.
   */
  dispose() {
    // Invalidates an adapter/device request that has not completed yet.
    this._initVersion++;
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._frameUniformBuffer) this._frameUniformBuffer.destroy();
    if (this._msaaTexture) this._msaaTexture.destroy();
    if (this._resources) this._resources.dispose();
    this._frameUniformBuffer = null;
    this._msaaTexture = null;
    this._msaaView = null;
    this._targetWidth = 0;
    this._targetHeight = 0;
    const shouldDestroyDevice = releaseDeviceLease(this);
    if (shouldDestroyDevice && this.device) {
      this.context.unconfigure();
      this.device.destroy();
    }
    this.device = null;
    this.context = null;
    this.format = null;
    this._frameBindGroup = null;
    this._resources = null;
    this._drawList.length = 0;
    this._ownsDevice = false;
  }

  _drawShape(pass, shape) {
    const instanced = !!shape.isInstanced;
    const geometryGPU = this._resources.geometryFor(shape.geometry);
    const shapeGPU = this._resources.shapeFor(shape);
    const pipeline = this._resources.pipelineFor(shape.material, instanced);

    // Per-object uniforms: world transform, color.
    const data = shapeGPU.data;
    data.set(shape.worldMatrix.elements, OBJECT_UNIFORM_OFFSET_2D.transform);
    const color = shape.material.color;
    // Colors are authored in sRGB; the shader shades in linear space
    // and encodes back at the end.
    const colorOffset = OBJECT_UNIFORM_OFFSET_2D.color;
    data[colorOffset] = srgbToLinear(color[0]);
    data[colorOffset + 1] = srgbToLinear(color[1]);
    data[colorOffset + 2] = srgbToLinear(color[2]);
    data[colorOffset + 3] = color.length > 3 ? color[3] : 1;
    this.device.queue.writeBuffer(shapeGPU.uniformBuffer, 0, data);

    pass.setPipeline(pipeline);
    pass.setBindGroup(SHADER_BIND_GROUP.object, shapeGPU.bindGroup);
    pass.setVertexBuffer(
      VERTEX_BUFFER_SLOT.geometry,
      geometryGPU.vertexBuffer,
    );
    if (instanced) {
      pass.setVertexBuffer(VERTEX_BUFFER_SLOT.instance, shapeGPU.instanceBuffer);
    }
    pass.setIndexBuffer(geometryGPU.indexBuffer, INDEX_FORMAT);
    pass.drawIndexed(shape.geometry.indexCount, instanced ? shape.count : 1);
  }
}
