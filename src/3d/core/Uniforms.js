import { srgbToLinear } from '../../math/color.js';
import { Vec3 } from '../../math/Vec3.js';
import { AmbientLight } from '../lights/AmbientLight.js';
import { DirectionalLight } from '../lights/DirectionalLight.js';
import { PointLight } from '../lights/PointLight.js';
import { MAX_POINT_LIGHTS } from '../constants.js';
import {
  normalizeDirectionalLightDirection,
} from './directionalLightDirection.js';

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const VEC4_FLOATS = 4;
const MAT4_FLOATS = 4 * VEC4_FLOATS;
const PADDED_VEC3_FLOATS = VEC4_FLOATS;
const FRAME_HEADER_FLOATS = MAT4_FLOATS + 3 * PADDED_VEC3_FLOATS;
const POINT_LIGHT_FLOATS = 2 * PADDED_VEC3_FLOATS;
const MATRIX_TRANSLATION_OFFSET = 3 * VEC4_FLOATS;
const POINT_LIGHT_COLOR_OFFSET = PADDED_VEC3_FLOATS;

export const FRAME_UNIFORM_SIZE =
  (FRAME_HEADER_FLOATS + MAX_POINT_LIGHTS * POINT_LIGHT_FLOATS) * FLOAT_BYTES;

export const OBJECT_UNIFORM_SIZE =
  (2 * MAT4_FLOATS + 2 * VEC4_FLOATS) * FLOAT_BYTES;

export const OBJECT_UNIFORM_OFFSET = Object.freeze({
  modelMatrix: 0,
  normalMatrix: MAT4_FLOATS,
  color: 2 * MAT4_FLOATS,
  shadowFlags: 2 * MAT4_FLOATS + VEC4_FLOATS,
});

const FRAME_OFFSET = Object.freeze({
  viewProjection: 0,
  lightDirection: MAT4_FLOATS,
  lightColor: MAT4_FLOATS + PADDED_VEC3_FLOATS,
  ambientColor: MAT4_FLOATS + 2 * PADDED_VEC3_FLOATS,
  pointLightCount: FRAME_HEADER_FLOATS - 1,
  pointLights: FRAME_HEADER_FLOATS,
});

/** Owns the reusable CPU staging array for one renderer's frame uniforms. */
export class FrameUniformWriter {
  constructor() {
    this.data = new Float32Array(FRAME_UNIFORM_SIZE / FLOAT_BYTES);
    this._lightDirection = new Vec3();
  }

  write(scene, camera, device, buffer) {
    const data = this.data;
    let directionalLight = null;
    let pointLightCount = 0;
    let ambientRed = 0;
    let ambientGreen = 0;
    let ambientBlue = 0;

    scene.traverseVisible((object) => {
      if (!directionalLight && object instanceof DirectionalLight) {
        directionalLight = object;
      }
      if (object instanceof PointLight && pointLightCount < MAX_POINT_LIGHTS) {
        this._writePointLight(pointLightCount++, object);
      }
      if (object instanceof AmbientLight) {
        ambientRed += srgbToLinear(object.color[0]) * object.intensity;
        ambientGreen += srgbToLinear(object.color[1]) * object.intensity;
        ambientBlue += srgbToLinear(object.color[2]) * object.intensity;
      }
    });

    data.set(camera.viewProjectionMatrix.elements, FRAME_OFFSET.viewProjection);
    data[FRAME_OFFSET.pointLightCount] = pointLightCount;
    writeVec3(
      data,
      FRAME_OFFSET.ambientColor,
      ambientRed,
      ambientGreen,
      ambientBlue,
    );
    this._writeDirectionalLight(directionalLight);
    device.queue.writeBuffer(buffer, 0, data);
    return directionalLight;
  }

  _writePointLight(index, light) {
    const base = FRAME_OFFSET.pointLights + index * POINT_LIGHT_FLOATS;
    const world = light.worldMatrix.elements;
    writeVec3(
      this.data,
      base,
      world[MATRIX_TRANSLATION_OFFSET],
      world[MATRIX_TRANSLATION_OFFSET + 1],
      world[MATRIX_TRANSLATION_OFFSET + 2],
    );
    writeLinearColor(
      this.data,
      base + POINT_LIGHT_COLOR_OFFSET,
      light.color,
      light.intensity,
    );
  }

  _writeDirectionalLight(light) {
    const direction = normalizeDirectionalLightDirection(
      this._lightDirection,
      light?.direction,
    );
    writeVec3(
      this.data,
      FRAME_OFFSET.lightDirection,
      direction.x,
      direction.y,
      direction.z,
    );

    if (!light) {
      writeVec3(this.data, FRAME_OFFSET.lightColor, 0, 0, 0);
      return;
    }

    writeLinearColor(
      this.data,
      FRAME_OFFSET.lightColor,
      light.color,
      light.intensity,
    );
  }
}

function writeVec3(target, offset, x, y, z) {
  target[offset] = x;
  target[offset + 1] = y;
  target[offset + 2] = z;
}

function writeLinearColor(target, offset, color, intensity) {
  target[offset] = srgbToLinear(color[0]) * intensity;
  target[offset + 1] = srgbToLinear(color[1]) * intensity;
  target[offset + 2] = srgbToLinear(color[2]) * intensity;
}
