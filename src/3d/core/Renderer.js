import { Mesh } from './Mesh.js';
import { Mat4 } from '../../math/Mat4.js';
import { srgbToLinear } from '../../math/color.js';
import { GpuResources } from './GpuResources.js';
import { initWebGpu } from '../../core/initWebGpu.js';
import { DirectionalLight } from '../lights/DirectionalLight.js';
import { AmbientLight } from '../lights/AmbientLight.js';

// FrameUniforms: mat4x4f (64) + three vec3f padded to 16 bytes each
// = 112 bytes, matching the WGSL struct in Material.js.
const FRAME_UNIFORM_SIZE = 112;
// Float offsets of the FrameUniforms fields; the skipped indices
// (19, 23, 27) are the vec3f padding.
const VIEW_PROJECTION = 0;
const LIGHT_DIRECTION = 16;
const LIGHT_COLOR = 20;
const AMBIENT_COLOR = 24;

// Float offsets of the ObjectUniforms fields, matching the WGSL struct
// in Material.js (two mat4x4f, then a vec4f).
const MODEL_MATRIX = 0;
const NORMAL_MATRIX = 16;
const OBJECT_COLOR = 32;

/**
 * The WebGPU renderer. Owns the device, the canvas swap chain and the
 * depth buffer; per-object GPU resources live in `GpuResources`.
 *
 * Usage:
 *   const renderer = new Renderer(canvas);
 *   await renderer.init();
 *   renderer.render(scene, camera);
 */
export class Renderer {
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
    /** How many objects the last render() call drew. */
    this.drawCount = 0;

    this._autoResize = autoResize;
    this._sampleCount = antialias ? 4 : 1;
    this._resizeObserver = null;
    this._ownsDevice = false;
    this._resources = null;
    this._depthTexture = null;
    this._depthView = null;
    this._msaaTexture = null;
    this._msaaView = null;
    this._opaqueList = [];
    this._transparentList = [];
    this._frameData = new Float32Array(FRAME_UNIFORM_SIZE / 4);
    this._normalMatrix = new Mat4();
  }

  /**
   * Requests the adapter/device and configures the canvas. Must be
   * awaited before rendering. Pass another already-initialized renderer
   * on the same canvas as `shared` to reuse its GPU device (a canvas
   * can only be configured for one device, so e.g. a Renderer2d and a
   * Renderer driving the same canvas must share one).
   *
   * @param {{device, context, format}} [shared]
   */
  async init(shared) {
    this._ownsDevice = !shared;
    const gpu = shared || (await initWebGpu(this.canvas));
    this.device = gpu.device;
    this.context = gpu.context;
    this.format = gpu.format;

    this._resources = new GpuResources(
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

  /** Resizes the drawing buffer and depth texture. Pass CSS pixel dimensions. */
  setSize(width, height) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(height * pixelRatio));

    if (!this.device) return;
    const size = [this.canvas.width, this.canvas.height];
    if (this._depthTexture) this._depthTexture.destroy();
    this._depthTexture = this.device.createTexture({
      size,
      format: 'depth24plus',
      sampleCount: this._sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this._depthView = this._depthTexture.createView();
    if (this._msaaTexture) this._msaaTexture.destroy();
    this._msaaTexture = null;
    this._msaaView = null;
    if (this._sampleCount > 1) {
      // The multisampled color target the pass draws into; it resolves
      // to the swap chain texture at the end of every render pass.
      this._msaaTexture = this.device.createTexture({
        size,
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

    this._writeFrameUniforms(scene, camera);

    // Opaque meshes draw first, in scene order. Transparent meshes draw
    // after, sorted back-to-front by view-space depth — the 3D
    // counterpart of Renderer2d's zIndex sort. Their pipelines blend
    // and don't write depth (see Pipelines), so what's behind them
    // stays visible.
    const opaque = this._opaqueList;
    const transparent = this._transparentList;
    opaque.length = 0;
    transparent.length = 0;
    let drawCount = 0;
    scene.traverseVisible((object) => {
      if (object instanceof Mesh) {
        (object.material.transparent ? transparent : opaque).push(object);
        drawCount += object.isInstanced ? object.count : 1;
      }
    });
    this.drawCount = drawCount;
    if (transparent.length > 0) {
      const v = camera.viewMatrix.elements;
      for (const mesh of transparent) {
        const w = mesh.worldMatrix.elements;
        // View-space z of the mesh origin; the camera looks down -z,
        // so the most negative depth is the farthest away.
        mesh._viewDepth = v[2] * w[12] + v[6] * w[13] + v[10] * w[14] + v[14];
      }
      transparent.sort((a, b) => a._viewDepth - b._viewDepth);
    }

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
      depthStencilAttachment: {
        view: this._depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pass.setBindGroup(0, this._frameBindGroup);
    for (const mesh of opaque) this._drawMesh(pass, mesh);
    for (const mesh of transparent) this._drawMesh(pass, mesh);

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  _writeFrameUniforms(scene, camera) {
    let directional = null;
    let ambientR = 0,
      ambientG = 0,
      ambientB = 0;
    scene.traverseVisible((object) => {
      if (!directional && object instanceof DirectionalLight)
        directional = object;
      if (object instanceof AmbientLight) {
        // Colors are authored in sRGB; lighting happens in linear.
        ambientR += srgbToLinear(object.color[0]) * object.intensity;
        ambientG += srgbToLinear(object.color[1]) * object.intensity;
        ambientB += srgbToLinear(object.color[2]) * object.intensity;
      }
    });

    const data = this._frameData;
    data.set(camera.viewProjectionMatrix.elements, VIEW_PROJECTION);

    if (directional) {
      const dir = directional.direction;
      const len = dir.length() || 1;
      data[LIGHT_DIRECTION] = dir.x / len;
      data[LIGHT_DIRECTION + 1] = dir.y / len;
      data[LIGHT_DIRECTION + 2] = dir.z / len;
      const { color, intensity } = directional;
      data[LIGHT_COLOR] = srgbToLinear(color[0]) * intensity;
      data[LIGHT_COLOR + 1] = srgbToLinear(color[1]) * intensity;
      data[LIGHT_COLOR + 2] = srgbToLinear(color[2]) * intensity;
    } else {
      data[LIGHT_DIRECTION] = 0;
      data[LIGHT_DIRECTION + 1] = -1;
      data[LIGHT_DIRECTION + 2] = 0;
      data[LIGHT_COLOR] = 0;
      data[LIGHT_COLOR + 1] = 0;
      data[LIGHT_COLOR + 2] = 0;
    }
    data[AMBIENT_COLOR] = ambientR;
    data[AMBIENT_COLOR + 1] = ambientG;
    data[AMBIENT_COLOR + 2] = ambientB;

    this.device.queue.writeBuffer(this._frameUniformBuffer, 0, data);
  }

  /**
   * Releases everything the renderer itself owns: the resize observer,
   * the frame uniform buffer, the depth texture and — when this
   * renderer created the GPU device rather than sharing one via
   * init(shared) — the device itself. Per-object GPU state lives on
   * the scene objects; release it with object.dispose(),
   * geometry.dispose() and texture.dispose(). The renderer cannot be
   * used after this.
   */
  dispose() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._frameUniformBuffer) this._frameUniformBuffer.destroy();
    if (this._depthTexture) this._depthTexture.destroy();
    if (this._msaaTexture) this._msaaTexture.destroy();
    this._frameUniformBuffer = null;
    this._depthTexture = null;
    this._depthView = null;
    this._msaaTexture = null;
    this._msaaView = null;
    if (this._ownsDevice && this.device) {
      this.context.unconfigure();
      this.device.destroy();
    }
    this.device = null;
    this.context = null;
  }

  _drawMesh(pass, mesh) {
    const instanced = !!mesh.isInstanced;
    const geometryGPU = this._resources.geometryFor(mesh.geometry);
    const meshGPU = this._resources.meshFor(mesh);
    const pipeline = this._resources.pipelineFor(mesh.material, instanced);

    // Per-object uniforms: model matrix, normal matrix, color.
    const data = meshGPU.data;
    data.set(mesh.worldMatrix.elements, MODEL_MATRIX);
    this._normalMatrix.copy(mesh.worldMatrix).invert().transpose();
    data.set(this._normalMatrix.elements, NORMAL_MATRIX);
    const color = mesh.material.color;
    data[OBJECT_COLOR] = srgbToLinear(color[0]);
    data[OBJECT_COLOR + 1] = srgbToLinear(color[1]);
    data[OBJECT_COLOR + 2] = srgbToLinear(color[2]);
    data[OBJECT_COLOR + 3] = color.length > 3 ? color[3] : 1;
    this.device.queue.writeBuffer(meshGPU.uniformBuffer, 0, data);

    pass.setPipeline(pipeline);
    pass.setBindGroup(1, meshGPU.bindGroup);
    pass.setVertexBuffer(0, geometryGPU.vertexBuffer);
    if (instanced) {
      if (mesh.needsUpdate) {
        this.device.queue.writeBuffer(
          meshGPU.instanceBuffer,
          0,
          mesh.instanceData,
        );
        mesh.needsUpdate = false;
      }
      pass.setVertexBuffer(1, meshGPU.instanceBuffer);
    }
    pass.setIndexBuffer(geometryGPU.indexBuffer, 'uint32');
    pass.drawIndexed(mesh.geometry.indexCount, instanced ? mesh.count : 1);
  }
}
