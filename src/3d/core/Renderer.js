import { Mesh } from './Mesh.js';
import { Mat4 } from '../../math/Mat4.js';
import { Frustum } from '../../math/Frustum.js';
import { srgbToLinear } from '../../math/color.js';
import { GpuResources } from './GpuResources.js';
import { DirectionalShadowMap } from './DirectionalShadowMap.js';
import {
  FRAME_UNIFORM_SIZE,
  FrameUniformWriter,
  OBJECT_UNIFORM_OFFSET,
} from './Uniforms.js';
import { initWebGpu } from '../../core/initWebGpu.js';
import {
  ANTIALIAS_SAMPLE_COUNT,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  DEPTH_CLEAR_VALUE,
  DEPTH_FORMAT,
  SINGLE_SAMPLE_COUNT,
  colorAttachment,
  drawingBufferSize,
  linearClearColor,
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
  isTriangleTopology,
} from '../../core/pipelineConstants.js';

/**
 * The WebGPU renderer. Owns or shares a device lease and manages the canvas
 * swap chain and depth buffer; per-object GPU resources live in GpuResources.
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
    /** Preferred non-sRGB format used to configure the canvas context. */
    this.format = null;
    /** Compatible sRGB view format used by color render passes. */
    this.colorFormat = null;
    /** Color-pass instances submitted by the last render(), after culling. */
    this.drawCount = 0;
    /** Shadow-pass instances submitted by the last render(), after culling. */
    this.shadowDrawCount = 0;

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
    this._shadowMap = null;
    this._depthTexture = null;
    this._depthView = null;
    this._msaaTexture = null;
    this._msaaView = null;
    this._targetWidth = 0;
    this._targetHeight = 0;
    this._opaqueList = [];
    this._transparentList = [];
    this._shadowMeshList = [];
    this._shadowCasters = [];
    this._preparedMeshes = new Map();
    this._frameUniformWriter = new FrameUniformWriter();
    this._normalMatrix = new Mat4();
    this._viewFrustum = new Frustum();
    this._shadowFrustum = new Frustum();
  }

  /**
   * Requests the adapter/device and configures the canvas. Must be
   * awaited before rendering. Pass another already-initialized renderer
   * on the same canvas as `shared` to reuse its GPU device (a canvas
   * can only be configured for one device, so e.g. a Renderer2d and a
   * Renderer driving the same canvas must share one).
   *
   * @param {{device, context, format, colorFormat}} [shared] another renderer,
   *   or an initWebGpu() result whose canvas viewFormats remain configured
   */
  async init(shared) {
    // Coalesce overlapping calls so one canvas is never configured with two
    // newly requested devices. Both callers observe the same result.
    if (this._initPromise) return this._initPromise;
    if (this.device) throw new Error('Renderer is already initialized');

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
      throw new Error('Renderer initialization was cancelled by dispose()');
    }
    return renderer;
  }

  async _initialize(shared, version) {
    const gpu = shared || (await initWebGpu(this.canvas));
    if (version !== this._initVersion) {
      // dispose() was called while the adapter/device request was pending.
      // No newer init can start until this promise settles, so this canvas
      // configuration is ours to release.
      if (!shared) {
        gpu.context.unconfigure();
        gpu.device.destroy();
      }
      throw new Error('Renderer initialization was cancelled by dispose()');
    }

    let leaseAcquired = false;
    try {
      const lease = acquireDeviceLease(this, gpu, shared);
      leaseAcquired = true;
      this.device = lease.device;
      this.context = lease.context;
      this.format = lease.format;
      this.colorFormat = lease.colorFormat;

      this._resources = new GpuResources(
        this.device,
        this.colorFormat,
        this._sampleCount,
      );
      this._shadowMap = new DirectionalShadowMap(
        this.device,
        this._resources.shadowBindGroupLayout,
        this._resources.objectBindGroupLayout,
      );

      this._frameUniformBuffer = this.device.createBuffer({
        size: FRAME_UNIFORM_SIZE,
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
        // Roll back membership and every resource created before the error.
        this.dispose();
      } else if (!shared) {
        gpu.context.unconfigure();
        gpu.device.destroy();
      }
      throw error;
    }
  }

  /**
   * Resizes the drawing buffer and depth texture. Pass CSS pixel dimensions;
   * they are scaled by the device pixel ratio and clamped to the device's
   * maxTextureDimension2D limit.
   */
  setSize(width, height) {
    const size = drawingBufferSize(
      width,
      height,
      this.device?.limits?.maxTextureDimension2D,
    );
    this.canvas.width = size.width;
    this.canvas.height = size.height;

    if (!this.device) return;
    this._recreateRenderTargets();
  }

  /** Keeps attachments valid when another renderer resized a shared canvas. */
  _ensureRenderTargets() {
    const sizeChanged =
      this._targetWidth !== this.canvas.width ||
      this._targetHeight !== this.canvas.height;
    const attachmentMissing =
      !this._depthTexture || (this._sampleCount > 1 && !this._msaaTexture);
    if (attachmentMissing || sizeChanged) this._recreateRenderTargets();
  }

  _recreateRenderTargets() {
    const size = [this.canvas.width, this.canvas.height];
    if (this._depthTexture) this._depthTexture.destroy();
    this._depthTexture = this.device.createTexture({
      size,
      format: DEPTH_FORMAT,
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
        format: this.colorFormat,
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
      throw new Error('Renderer.init() must complete before render()');
    }
    this._ensureRenderTargets();
    camera.aspect = this.canvas.width / this.canvas.height;

    scene.updateWorldMatrix();
    camera.updateMatrices();

    const directionalLight = this._writeFrameUniforms(scene, camera);
    this._shadowMap.update(directionalLight);
    this._collectMeshes(
      scene,
      camera,
      directionalLight?.shadow?.camera || null,
    );
    this._prepareMeshes();

    const encoder = this.device.createCommandEncoder();
    this.shadowDrawCount = this._shadowMap.render(
      encoder,
      this._shadowCasters,
    );
    const pass = this._beginRenderPass(encoder, scene.background);
    pass.setBindGroup(SHADER_BIND_GROUP.frame, this._frameBindGroup);
    pass.setBindGroup(SHADER_BIND_GROUP.shadow, this._shadowMap.bindGroup);
    for (const mesh of this._opaqueList) this._drawMesh(pass, mesh);
    for (const mesh of this._transparentList) this._drawMesh(pass, mesh);

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Collects camera-visible color meshes and light-visible shadow casters,
   * then orders retained transparent meshes back-to-front.
   */
  _collectMeshes(scene, camera, shadowCamera = null) {
    const {
      _opaqueList: opaque,
      _transparentList: transparent,
      _shadowMeshList: shadowMeshes,
    } = this;
    opaque.length = 0;
    transparent.length = 0;
    shadowMeshes.length = 0;
    this._viewFrustum.setFromViewProjectionMatrix(
      camera.viewProjectionMatrix,
    );
    const collectShadows = this._shadowMap?.enabled && shadowCamera;
    if (collectShadows) {
      this._shadowFrustum.setFromViewProjectionMatrix(
        shadowCamera.viewProjectionMatrix,
      );
    }

    let drawCount = 0;
    scene.traverseVisible((object) => {
      if (object instanceof Mesh) {
        if (object.isInstanced && object.count === 0) return;
        if (this._intersectsFrustum(object, this._viewFrustum)) {
          (object.material.transparent ? transparent : opaque).push(object);
          drawCount += object.isInstanced ? object.count : 1;
        }
        if (
          collectShadows &&
          object.castShadow &&
          !object.material.transparent &&
          isTriangleTopology(object.material.topology) &&
          this._intersectsFrustum(object, this._shadowFrustum)
        ) {
          shadowMeshes.push(object);
        }
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
  }

  _intersectsFrustum(mesh, frustum) {
    return (
      !mesh.frustumCulled ||
      frustum.intersectsBox(mesh.bounds, mesh.worldMatrix)
    );
  }

  _beginRenderPass(encoder, background) {
    const swapView = this.context
      .getCurrentTexture()
      .createView({ format: this.colorFormat });
    return encoder.beginRenderPass({
      colorAttachments: [
        colorAttachment(
          this._msaaView,
          swapView,
          linearClearColor(background),
        ),
      ],
      depthStencilAttachment: {
        view: this._depthView,
        depthClearValue: DEPTH_CLEAR_VALUE,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
  }

  _writeFrameUniforms(scene, camera) {
    return this._frameUniformWriter.write(
      scene,
      camera,
      this.device,
      this._frameUniformBuffer,
    );
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
    if (this._depthTexture) this._depthTexture.destroy();
    if (this._msaaTexture) this._msaaTexture.destroy();
    if (this._shadowMap) this._shadowMap.dispose();
    if (this._resources) this._resources.dispose();
    this._frameUniformBuffer = null;
    this._depthTexture = null;
    this._depthView = null;
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
    this.colorFormat = null;
    this._frameBindGroup = null;
    this._resources = null;
    this._shadowMap = null;
    this._opaqueList.length = 0;
    this._transparentList.length = 0;
    this._shadowMeshList.length = 0;
    this._shadowCasters.length = 0;
    this._preparedMeshes.clear();
    this.drawCount = 0;
    this.shadowDrawCount = 0;
    this._ownsDevice = false;
  }

  _drawMesh(pass, mesh) {
    const { geometryGPU, meshGPU } = this._preparedMeshes.get(mesh);
    const instanced = !!mesh.isInstanced;
    const pipeline = this._resources.pipelineFor(mesh.material, instanced);

    pass.setPipeline(pipeline);
    pass.setBindGroup(SHADER_BIND_GROUP.object, meshGPU.bindGroup);
    pass.setVertexBuffer(
      VERTEX_BUFFER_SLOT.geometry,
      geometryGPU.vertexBuffer,
    );
    if (instanced) {
      pass.setVertexBuffer(VERTEX_BUFFER_SLOT.instance, meshGPU.instanceBuffer);
    }
    pass.setIndexBuffer(geometryGPU.indexBuffer, INDEX_FORMAT);
    pass.drawIndexed(mesh.geometry.indexCount, instanced ? mesh.count : 1);
  }

  /** Uploads object/instance data before either render pass reads it. */
  _prepareMeshes() {
    this._preparedMeshes.clear();
    this._shadowCasters.length = 0;
    for (const mesh of this._opaqueList) this._prepareMesh(mesh);
    for (const mesh of this._transparentList) this._prepareMesh(mesh);
    for (const mesh of this._shadowMeshList) {
      const prepared =
        this._preparedMeshes.get(mesh) || this._prepareMesh(mesh);
      this._shadowCasters.push(prepared);
    }
  }

  _prepareMesh(mesh) {
    const geometryGPU = this._resources.geometryFor(mesh.geometry);
    const meshGPU = this._resources.meshFor(mesh);
    const data = meshGPU.data;

    data.set(mesh.worldMatrix.elements, OBJECT_UNIFORM_OFFSET.modelMatrix);
    this._normalMatrix.copy(mesh.worldMatrix);
    if (this._normalMatrix.tryInvert()) {
      this._normalMatrix.transpose();
    } else {
      // A collapsed axis has no inverse normal transform. Keep rendering
      // deterministic; raycasting/dragging skip the singular object.
      this._normalMatrix.identity();
    }
    data.set(
      this._normalMatrix.elements,
      OBJECT_UNIFORM_OFFSET.normalMatrix,
    );

    const color = mesh.material.color;
    const colorOffset = OBJECT_UNIFORM_OFFSET.color;
    data[colorOffset] = srgbToLinear(color[0]);
    data[colorOffset + 1] = srgbToLinear(color[1]);
    data[colorOffset + 2] = srgbToLinear(color[2]);
    data[colorOffset + 3] = color.length > 3 ? color[3] : 1;
    data.fill(0, OBJECT_UNIFORM_OFFSET.shadowFlags);
    data[OBJECT_UNIFORM_OFFSET.shadowFlags] = mesh.receiveShadow ? 1 : 0;
    this.device.queue.writeBuffer(meshGPU.uniformBuffer, 0, data);

    const prepared = { mesh, geometryGPU, meshGPU };
    this._preparedMeshes.set(mesh, prepared);
    return prepared;
  }
}
