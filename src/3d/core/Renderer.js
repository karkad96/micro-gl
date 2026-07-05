import { Mesh } from './Mesh.js';
import { Mat4 } from '../../math/Mat4.js';
import { GPUResources } from './GPUResources.js';
import { initWebGPU } from '../../core/initWebGPU.js';
import { DirectionalLight } from '../lights/DirectionalLight.js';
import { AmbientLight } from '../lights/AmbientLight.js';

// FrameUniforms: mat4x4f (64) + three vec3f padded to 16 bytes each
// = 112 bytes, matching the WGSL struct in Material.js.
const FRAME_UNIFORM_SIZE = 112;

/**
 * The WebGPU renderer. Owns the device, the canvas swap chain and the
 * depth buffer; per-object GPU resources live in `GPUResources`.
 *
 * Usage:
 *   const renderer = new Renderer(canvas);
 *   await renderer.init();
 *   renderer.render(scene, camera);
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.format = null;

    this._resources = null;
    this._depthTexture = null;
    this._depthView = null;
    this._frameData = new Float32Array(FRAME_UNIFORM_SIZE / 4);
    this._normalMatrix = new Mat4();
  }

  /**
   * Requests the adapter/device and configures the canvas. Must be
   * awaited before rendering. Pass another already-initialized renderer
   * on the same canvas as `shared` to reuse its GPU device (a canvas
   * can only be configured for one device, so e.g. a Renderer2D and a
   * Renderer driving the same canvas must share one).
   *
   * @param {{device, context, format}} [shared]
   */
  async init(shared) {
    const gpu = shared || (await initWebGPU(this.canvas));
    this.device = gpu.device;
    this.context = gpu.context;
    this.format = gpu.format;

    this._resources = new GPUResources(this.device, this.format);

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

  /** Resizes the drawing buffer and depth texture. Pass CSS pixel dimensions. */
  setSize(width, height) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(height * pixelRatio));

    if (!this.device) return;
    if (this._depthTexture) this._depthTexture.destroy();
    this._depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this._depthView = this._depthTexture.createView();
  }

  /** Draws one frame of `scene` as seen from `camera`. */
  render(scene, camera) {
    camera.aspect = this.canvas.width / this.canvas.height;

    scene.updateWorldMatrix();
    camera.updateMatrices();

    this._writeFrameUniforms(scene, camera);

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
      depthStencilAttachment: {
        view: this._depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pass.setBindGroup(0, this._frameBindGroup);
    scene.traverse((object) => {
      if (object instanceof Mesh && object.visible) {
        this._drawMesh(pass, object);
      }
    });

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  _writeFrameUniforms(scene, camera) {
    let directional = null;
    let ambientR = 0,
      ambientG = 0,
      ambientB = 0;
    scene.traverse((object) => {
      if (!directional && object instanceof DirectionalLight)
        directional = object;
      if (object instanceof AmbientLight) {
        ambientR += object.color[0] * object.intensity;
        ambientG += object.color[1] * object.intensity;
        ambientB += object.color[2] * object.intensity;
      }
    });

    const data = this._frameData;
    data.set(camera.viewProjectionMatrix.elements, 0);

    if (directional) {
      const dir = directional.direction;
      const len = dir.length() || 1;
      data[16] = dir.x / len;
      data[17] = dir.y / len;
      data[18] = dir.z / len;
      data[20] = directional.color[0] * directional.intensity;
      data[21] = directional.color[1] * directional.intensity;
      data[22] = directional.color[2] * directional.intensity;
    } else {
      data[16] = 0;
      data[17] = -1;
      data[18] = 0;
      data[20] = 0;
      data[21] = 0;
      data[22] = 0;
    }
    data[24] = ambientR;
    data[25] = ambientG;
    data[26] = ambientB;

    this.device.queue.writeBuffer(this._frameUniformBuffer, 0, data);
  }

  _drawMesh(pass, mesh) {
    const geometryGPU = this._resources.geometryFor(mesh.geometry);
    const meshGPU = this._resources.meshFor(mesh);
    const pipeline = this._resources.pipelineFor(mesh.material);

    // Per-object uniforms: model matrix, normal matrix, color.
    const data = meshGPU.data;
    data.set(mesh.worldMatrix.elements, 0);
    this._normalMatrix.copy(mesh.worldMatrix).invert().transpose();
    data.set(this._normalMatrix.elements, 16);
    const color = mesh.material.color;
    data[32] = color[0];
    data[33] = color[1];
    data[34] = color[2];
    data[35] = color.length > 3 ? color[3] : 1;
    this.device.queue.writeBuffer(meshGPU.uniformBuffer, 0, data);

    pass.setPipeline(pipeline);
    pass.setBindGroup(1, meshGPU.bindGroup);
    pass.setVertexBuffer(0, geometryGPU.vertexBuffer);
    pass.setIndexBuffer(geometryGPU.indexBuffer, 'uint32');
    pass.drawIndexed(mesh.geometry.indexCount);
  }
}
