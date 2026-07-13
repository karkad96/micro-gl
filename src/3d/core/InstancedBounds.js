import { INSTANCE_SIZE } from '../constants.js';

const MATRIX_FLOATS = 16;

/**
 * Builds the mesh-local AABB containing every `instanceMatrix * bounds`.
 * Returns `null` when custom data cannot be represented safely, which tells
 * the renderer to keep the batch visible rather than risk a false cull.
 */
export function computeInstancedBounds(bounds, instanceData, count) {
  const min = bounds?.min;
  const max = bounds?.max;
  if (!hasFiniteBounds(min, max)) return null;
  if (!Number.isInteger(count) || count < 0) return null;

  const centerX = (min[0] + max[0]) / 2;
  const centerY = (min[1] + max[1]) / 2;
  const centerZ = (min[2] + max[2]) / 2;
  const extentX = (max[0] - min[0]) / 2;
  const extentY = (max[1] - min[1]) / 2;
  const extentZ = (max[2] - min[2]) / 2;
  const combinedMin = [Infinity, Infinity, Infinity];
  const combinedMax = [-Infinity, -Infinity, -Infinity];

  for (let instance = 0; instance < count; instance++) {
    const offset = instance * INSTANCE_SIZE;
    if (!hasFiniteMatrix(instanceData, offset)) return null;

    const m00 = instanceData[offset];
    const m10 = instanceData[offset + 1];
    const m20 = instanceData[offset + 2];
    const m30 = instanceData[offset + 3];
    const m01 = instanceData[offset + 4];
    const m11 = instanceData[offset + 5];
    const m21 = instanceData[offset + 6];
    const m31 = instanceData[offset + 7];
    const m02 = instanceData[offset + 8];
    const m12 = instanceData[offset + 9];
    const m22 = instanceData[offset + 10];
    const m32 = instanceData[offset + 11];
    const m03 = instanceData[offset + 12];
    const m13 = instanceData[offset + 13];
    const m23 = instanceData[offset + 14];
    const m33 = instanceData[offset + 15];
    if (!isAffineMatrix(m30, m31, m32, m33)) return null;

    const transformedCenterX =
      m00 * centerX + m01 * centerY + m02 * centerZ + m03;
    const transformedCenterY =
      m10 * centerX + m11 * centerY + m12 * centerZ + m13;
    const transformedCenterZ =
      m20 * centerX + m21 * centerY + m22 * centerZ + m23;
    const transformedExtentX =
      Math.abs(m00) * extentX +
      Math.abs(m01) * extentY +
      Math.abs(m02) * extentZ;
    const transformedExtentY =
      Math.abs(m10) * extentX +
      Math.abs(m11) * extentY +
      Math.abs(m12) * extentZ;
    const transformedExtentZ =
      Math.abs(m20) * extentX +
      Math.abs(m21) * extentY +
      Math.abs(m22) * extentZ;
    if (
      !Number.isFinite(transformedCenterX) ||
      !Number.isFinite(transformedCenterY) ||
      !Number.isFinite(transformedCenterZ) ||
      !Number.isFinite(transformedExtentX) ||
      !Number.isFinite(transformedExtentY) ||
      !Number.isFinite(transformedExtentZ)
    ) {
      return null;
    }

    expandBounds(
      combinedMin,
      combinedMax,
      transformedCenterX,
      transformedCenterY,
      transformedCenterZ,
      transformedExtentX,
      transformedExtentY,
      transformedExtentZ,
    );
  }
  return { min: combinedMin, max: combinedMax };
}

function hasFiniteBounds(min, max) {
  if (!min || !max || min.length < 3 || max.length < 3) return false;
  for (let axis = 0; axis < 3; axis++) {
    if (
      !Number.isFinite(min[axis]) ||
      !Number.isFinite(max[axis]) ||
      min[axis] > max[axis]
    ) {
      return false;
    }
  }
  return true;
}

function hasFiniteMatrix(data, offset) {
  for (let component = 0; component < MATRIX_FLOATS; component++) {
    if (!Number.isFinite(data[offset + component])) return false;
  }
  return true;
}

function isAffineMatrix(m30, m31, m32, m33) {
  // These values are exact for every affine Mat4 produced by the library.
  // Even a tiny projective term can materially change coordinates after the
  // homogeneous divide, so approximating it would risk a false cull.
  return m30 === 0 && m31 === 0 && m32 === 0 && m33 === 1;
}

function expandBounds(
  min,
  max,
  centerX,
  centerY,
  centerZ,
  extentX,
  extentY,
  extentZ,
) {
  min[0] = Math.min(min[0], centerX - extentX);
  min[1] = Math.min(min[1], centerY - extentY);
  min[2] = Math.min(min[2], centerZ - extentZ);
  max[0] = Math.max(max[0], centerX + extentX);
  max[1] = Math.max(max[1], centerY + extentY);
  max[2] = Math.max(max[2], centerZ + extentZ);
}
