import { Shape2D } from './Shape2D.js';
import { GPUResources2D } from './GPUResources2D.js';
import { initWebGPU } from '../../core/initWebGPU.js';

// FrameUniforms: one mat3x3f (48 bytes, columns padded to 16 bytes),
// matching the WGSL struct in Material2D.js. Mat3.elements already uses
// this layout, so the camera matrix is uploaded directly.
const FRAME_UNIFORM_SIZE = 48;

/**
 * The 2D renderer. Same shape as the 3D Renderer — one render pass,
 * lazy GPU resources — but with everything a flat scene doesn't need
 * removed: there is no depth buffer. Draw order comes from sorting
 * shapes by `zIndex` (painter's algorithm) and alpha blending is on,
 * so transparent shapes work out of the box.
 *
 * Usage:
 *   const renderer2d = new Renderer2D(canvas);
 *   await renderer2d.init();
 *   renderer2d.render(scene2d, camera2d);
 *
 * To share a canvas with a 3D Renderer, initialize one of them first
 * and pass it to the other's `init` so they use the same GPU device:
 *   await renderer2d.init(renderer3d);
 */
export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.format = null;

    this._resources = null;
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
    const gpu = shared || (await initWebGPU(this.canvas));
    this.device = gpu.device;
    this.context = gpu.context;
    this.format = gpu.format;

    this._resources = new GPUResources2D(this.device, this.format);

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
    return this;
  }

  /** Resizes the drawing buffer. Pass CSS pixel dimensions. */
  setSize(width, height) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(height * pixelRatio));
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
    scene.traverse((object) => {
      if (object instanceof Shape2D && object.visible) {
        drawList.push(object);
      }
    });
    drawList.sort((a, b) => a.zIndex - b.zIndex);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
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

  _drawShape(pass, shape) {
    const geometryGPU = this._resources.geometryFor(shape.geometry);
    const shapeGPU = this._resources.shapeFor(shape);
    const pipeline = this._resources.pipelineFor(shape.material);

    // Per-object uniforms: world transform, color.
    const data = shapeGPU.data;
    data.set(shape.worldMatrix.elements, 0);
    const color = shape.material.color;
    data[12] = color[0];
    data[13] = color[1];
    data[14] = color[2];
    data[15] = color.length > 3 ? color[3] : 1;
    this.device.queue.writeBuffer(shapeGPU.uniformBuffer, 0, data);

    pass.setPipeline(pipeline);
    pass.setBindGroup(1, shapeGPU.bindGroup);
    pass.setVertexBuffer(0, geometryGPU.vertexBuffer);
    pass.setIndexBuffer(geometryGPU.indexBuffer, 'uint32');
    pass.drawIndexed(shape.geometry.indexCount);
  }
}
