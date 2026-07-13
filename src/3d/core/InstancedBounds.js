import { INSTANCE_SIZE } from '../constants.js';
import { isFiniteAffineInstanceMatrix } from './InstanceMatrix.js';

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
    if (!isFiniteAffineInstanceMatrix(instanceData, offset)) return null;

    const m00 = instanceData[offset];
    const m10 = instanceData[offset + 1];
    const m20 = instanceData[offset + 2];
    const m01 = instanceData[offset + 4];
    const m11 = instanceData[offset + 5];
    const m21 = instanceData[offset + 6];
    const m02 = instanceData[offset + 8];
    const m12 = instanceData[offset + 9];
    const m22 = instanceData[offset + 10];
    const m03 = instanceData[offset + 12];
    const m13 = instanceData[offset + 13];
    const m23 = instanceData[offset + 14];

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
