import { Mat4 } from '../../math/Mat4.js';
import { Vec3 } from '../../math/Vec3.js';
import {
  INDEX_FORMAT,
  SHADER_BIND_GROUP,
  SHADER_BINDING,
  SHADOW_BINDING,
  VERTEX_BUFFER_SLOT,
} from '../../core/pipelineConstants.js';
import {
  DIRECTIONAL_SHADOW_DEPTH_FORMAT,
  SHADOW_SAMPLE_COUNT,
} from '../constants.js';
import { ShadowPipelines } from './ShadowPipelines.js';
import {
  normalizeDirectionalLightDirection,
} from './directionalLightDirection.js';

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const MAT4_FLOATS = 16;
const PARAM_FLOATS = 4;
const SHADOW_UNIFORM_FLOATS = MAT4_FLOATS + PARAM_FLOATS;
const SHADOW_UNIFORM_SIZE = SHADOW_UNIFORM_FLOATS * FLOAT_BYTES;
const SHADOW_MAP_FALLBACK_SIZE = 1;
const SHADOW_DEPTH_CLEAR_VALUE = 1;

export const SHADOW_UNIFORM_OFFSET = Object.freeze({
  viewProjection: 0,
  enabled: MAT4_FLOATS,
  bias: MAT4_FLOATS + 1,
  normalBias: MAT4_FLOATS + 2,
  texelSize: MAT4_FLOATS + 3,
});

/**
 * Renderer-local depth texture, uniforms and render pass for the first
 * directional light in a scene. Lights only retain CPU configuration, so the
 * same scene can be rendered safely by different GPU devices.
 */
export class DirectionalShadowMap {
  constructor(device, samplingLayout, objectLayout) {
    this.device = device;
    this.enabled = false;
    this._mapSize = 0;
    this._data = new Float32Array(SHADOW_UNIFORM_FLOATS);
    this._identity = new Mat4();
    this._direction = new Vec3();
    this._uniformBuffer = null;
    this._texture = null;

    try {
      this._uniformBuffer = device.createBuffer({
        label: 'Directional shadow uniforms',
        size: SHADOW_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this._shadowUniformLayout = device.createBindGroupLayout({
        label: 'Directional shadow pass uniforms',
        entries: [
          {
            binding: SHADER_BINDING.uniforms,
            visibility: GPUShaderStage.VERTEX,
            buffer: {},
          },
        ],
      });
      this._shadowUniformBindGroup = device.createBindGroup({
        label: 'Directional shadow pass uniforms',
        layout: this._shadowUniformLayout,
        entries: [
          {
            binding: SHADER_BINDING.uniforms,
            resource: { buffer: this._uniformBuffer },
          },
        ],
      });
      this._sampler = device.createSampler({
        label: 'Directional shadow comparison sampler',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        minFilter: 'linear',
        magFilter: 'linear',
        compare: 'less-equal',
      });
      this._samplingLayout = samplingLayout;
      this._pipelines = new ShadowPipelines(
        device,
        this._shadowUniformLayout,
        objectLayout,
      );
      this._replaceTexture(SHADOW_MAP_FALLBACK_SIZE);
      this._writeDisabledUniforms();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Sampling bind group bound by the renderer's color pass. */
  get bindGroup() {
    return this._samplingBindGroup;
  }

  /**
   * Validates the light's configuration, resizes the map if necessary and
   * uploads the light-camera transform. Returns whether a depth pass is needed.
   */
  update(light) {
    if (!light || !light.castShadow) {
      const wasEnabled = this.enabled;
      this.enabled = false;
      if (wasEnabled) this._writeDisabledUniforms();
      return false;
    }

    const shadow = light.shadow;
    validateShadow(shadow, this.device.limits?.maxTextureDimension2D);
    if (shadow.mapSize !== this._mapSize) {
      this._replaceTexture(shadow.mapSize);
    }

    const camera = shadow.camera;
    normalizeDirectionalLightDirection(this._direction, light.direction);

    const distance = (camera.near + camera.far) / 2;
    camera.position.copy(camera.target);
    camera.position.x -= this._direction.x * distance;
    camera.position.y -= this._direction.y * distance;
    camera.position.z -= this._direction.z * distance;
    camera.aspect = 1;
    camera.updateMatrices();

    this._data.set(
      camera.viewProjectionMatrix.elements,
      SHADOW_UNIFORM_OFFSET.viewProjection,
    );
    this._data[SHADOW_UNIFORM_OFFSET.enabled] = 1;
    this._data[SHADOW_UNIFORM_OFFSET.bias] = shadow.bias;
    this._data[SHADOW_UNIFORM_OFFSET.normalBias] = shadow.normalBias;
    this._data[SHADOW_UNIFORM_OFFSET.texelSize] = 1 / shadow.mapSize;
    this.device.queue.writeBuffer(this._uniformBuffer, 0, this._data);
    this.enabled = true;
    return true;
  }

  /** Encodes and returns the number of caster instances drawn. */
  render(encoder, casters) {
    if (!this.enabled) return 0;

    const pass = encoder.beginRenderPass({
      label: 'Directional shadow pass',
      colorAttachments: [],
      depthStencilAttachment: {
        view: this._textureView,
        depthClearValue: SHADOW_DEPTH_CLEAR_VALUE,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    pass.setBindGroup(SHADER_BIND_GROUP.frame, this._shadowUniformBindGroup);

    let drawCount = 0;
    for (const { mesh, geometryGPU, meshGPU } of casters) {
      const instanced = !!mesh.isInstanced;
      pass.setPipeline(this._pipelines.pipelineFor(mesh.material, instanced));
      pass.setBindGroup(SHADER_BIND_GROUP.object, meshGPU.shadowBindGroup);
      pass.setVertexBuffer(
        VERTEX_BUFFER_SLOT.geometry,
        geometryGPU.vertexBuffer,
      );
      if (instanced) {
        pass.setVertexBuffer(
          VERTEX_BUFFER_SLOT.instance,
          meshGPU.instanceBuffer,
        );
      }
      pass.setIndexBuffer(geometryGPU.indexBuffer, INDEX_FORMAT);
      pass.drawIndexed(mesh.geometry.indexCount, instanced ? mesh.count : 1);
      drawCount += instanced ? mesh.count : 1;
    }
    pass.end();
    return drawCount;
  }

  dispose() {
    if (this._texture) this._texture.destroy();
    if (this._uniformBuffer) this._uniformBuffer.destroy();
    this._texture = null;
    this._textureView = null;
    this._uniformBuffer = null;
    this._samplingBindGroup = null;
    this.enabled = false;
  }

  _writeDisabledUniforms() {
    this._data.set(
      this._identity.elements,
      SHADOW_UNIFORM_OFFSET.viewProjection,
    );
    this._data.fill(0, SHADOW_UNIFORM_OFFSET.enabled);
    this._data[SHADOW_UNIFORM_OFFSET.texelSize] = 1 / this._mapSize;
    this.device.queue.writeBuffer(this._uniformBuffer, 0, this._data);
  }

  _replaceTexture(mapSize) {
    const texture = this.device.createTexture({
      label: 'Directional shadow map',
      size: [mapSize, mapSize],
      format: DIRECTIONAL_SHADOW_DEPTH_FORMAT,
      sampleCount: SHADOW_SAMPLE_COUNT,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    let textureView;
    let samplingBindGroup;
    try {
      textureView = texture.createView();
      samplingBindGroup = this.device.createBindGroup({
        label: 'Directional shadow sampling',
        layout: this._samplingLayout,
        entries: [
          {
            binding: SHADOW_BINDING.uniforms,
            resource: { buffer: this._uniformBuffer },
          },
          { binding: SHADOW_BINDING.map, resource: textureView },
          { binding: SHADOW_BINDING.sampler, resource: this._sampler },
        ],
      });
    } catch (error) {
      texture.destroy();
      throw error;
    }

    const previousTexture = this._texture;
    this._texture = texture;
    this._textureView = textureView;
    this._samplingBindGroup = samplingBindGroup;
    this._mapSize = mapSize;
    if (previousTexture) previousTexture.destroy();
  }
}

function validateShadow(shadow, maxTextureDimension) {
  if (!shadow || !shadow.camera) {
    throw new TypeError('DirectionalLight.shadow must be a DirectionalShadow');
  }
  if (!Number.isInteger(shadow.mapSize) || shadow.mapSize < 1) {
    throw new RangeError('DirectionalShadow.mapSize must be a positive integer');
  }
  if (
    Number.isFinite(maxTextureDimension) &&
    shadow.mapSize > maxTextureDimension
  ) {
    throw new RangeError(
      `DirectionalShadow.mapSize cannot exceed ${maxTextureDimension}`,
    );
  }
  if (!Number.isFinite(shadow.bias) || !Number.isFinite(shadow.normalBias)) {
    throw new RangeError('Directional shadow biases must be finite numbers');
  }

  const { camera } = shadow;
  if (!Number.isFinite(camera.size) || camera.size <= 0) {
    throw new RangeError('Directional shadow camera size must be positive');
  }
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) {
    throw new RangeError('Directional shadow camera zoom must be positive');
  }
  if (
    !Number.isFinite(camera.near) ||
    !Number.isFinite(camera.far) ||
    camera.near < 0 ||
    camera.far <= camera.near
  ) {
    throw new RangeError(
      'Directional shadow camera requires 0 <= near < far',
    );
  }
}
