const DIRECTION_EPSILON = 1e-12;

/**
 * Writes a finite unit directional-light vector into `target`. Components are
 * scaled before measuring length so very large finite vectors cannot overflow.
 * Missing, non-finite and effectively zero directions fall back to down.
 */
export function normalizeDirectionalLightDirection(target, source) {
  const x = source?.x;
  const y = source?.y;
  const z = source?.z;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return setFallbackDirection(target);
  }

  const scale = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  if (scale === 0) return setFallbackDirection(target);

  const scaledX = x / scale;
  const scaledY = y / scale;
  const scaledZ = z / scale;
  const scaledLength = Math.hypot(scaledX, scaledY, scaledZ);
  if (scale <= DIRECTION_EPSILON / scaledLength) {
    return setFallbackDirection(target);
  }

  const inverseLength = 1 / scaledLength;
  return target.set(
    scaledX * inverseLength,
    scaledY * inverseLength,
    scaledZ * inverseLength,
  );
}

function setFallbackDirection(target) {
  return target.set(0, -1, 0);
}
