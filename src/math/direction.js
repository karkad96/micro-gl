/**
 * Returns a finite unit 2D direction from numeric components or a vector-like
 * object. Max-component scaling keeps normalization stable for large values.
 */
export function normalizeDirection2d(x, y) {
  if (isVectorLike(x)) {
    const direction = x;
    x = direction.x ?? direction[0];
    y = direction.y ?? direction[1];
  }
  return normalizeDirection([x, y], '2D');
}

/** The 3D counterpart of normalizeDirection2d. */
export function normalizeDirection3d(x, y, z) {
  if (isVectorLike(x)) {
    const direction = x;
    x = direction.x ?? direction[0];
    y = direction.y ?? direction[1];
    z = direction.z ?? direction[2];
  }
  return normalizeDirection([x, y, z], '3D');
}

function isVectorLike(value) {
  return typeof value === 'object' && value !== null;
}

function normalizeDirection(components, dimension) {
  if (!components.every(Number.isFinite)) {
    throw new RangeError(
      `Direction must be a finite, non-zero ${dimension} vector`,
    );
  }

  const scale = Math.max(...components.map(Math.abs));
  if (scale === 0) {
    throw new RangeError(
      `Direction must be a finite, non-zero ${dimension} vector`,
    );
  }

  const scaled = components.map((component) => component / scale);
  const length = Math.hypot(...scaled);
  return scaled.map((component) => component / length);
}
