import {
  INSTANCE_MATRIX_COMPONENTS,
  INSTANCE_SIZE,
} from '../constants.js';

/** Whether one packed instance contains a finite affine mat4 transform. */
export function isFiniteAffineInstanceMatrix(data, offset) {
  if (!hasMatrixComponents(data, offset)) return false;
  for (
    let component = 0;
    component < INSTANCE_MATRIX_COMPONENTS;
    component++
  ) {
    if (!Number.isFinite(data[offset + component])) return false;
  }
  return hasAffineRow(data, offset);
}

/** Copies one packed affine instance transform into a Mat4-like target. */
export function copyAffineInstanceMatrix(data, instanceId, target) {
  const offset = instanceId * INSTANCE_SIZE;
  if (!hasMatrixComponents(data, offset)) return false;

  const elements = target.elements;
  for (
    let component = 0;
    component < INSTANCE_MATRIX_COMPONENTS;
    component++
  ) {
    const value = data[offset + component];
    if (!Number.isFinite(value)) return false;
    elements[component] = value;
  }
  return hasAffineRow(elements, 0);
}

function hasMatrixComponents(data, offset) {
  return (
    data &&
    Number.isInteger(offset) &&
    offset >= 0 &&
    offset + INSTANCE_MATRIX_COMPONENTS <= data.length
  );
}

function hasAffineRow(elements, offset) {
  // These values are exact for every affine Mat4 produced by the library.
  // Even a tiny projective term can materially affect homogeneous coordinates.
  return (
    elements[offset + 3] === 0 &&
    elements[offset + 7] === 0 &&
    elements[offset + 11] === 0 &&
    elements[offset + 15] === 1
  );
}
