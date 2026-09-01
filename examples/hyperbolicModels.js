const UNIT_DISK_TOLERANCE = 1e-6;

/**
 * Maps a point from the Poincare disk to the Klein disk.
 *
 * The map is radial, fixes the unit boundary, and sends every Poincare
 * geodesic to a Euclidean chord of the unit disk.
 */
export function poincareToKlein(point) {
  const [x, y, normSquared] = readUnitDiskPoint(point, 'Poincare point');
  const scale = 2 / (1 + normSquared);
  return [x * scale, y * scale];
}

/** Maps a point from the Klein disk back to the Poincare disk. */
export function kleinToPoincare(point) {
  const [x, y, normSquared] = readUnitDiskPoint(point, 'Klein point');
  const scale = 1 / (1 + Math.sqrt(Math.max(0, 1 - normSquared)));
  return [x * scale, y * scale];
}

function readUnitDiskPoint(point, name) {
  let x = point?.x ?? point?.[0];
  let y = point?.y ?? point?.[1];
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError(`${name} must contain two finite coordinates`);
  }

  let normSquared = x * x + y * y;
  if (normSquared > 1 + UNIT_DISK_TOLERANCE) {
    throw new RangeError(`${name} must lie in the closed unit disk`);
  }

  // Rendering endpoints arrive through Float32 geometry and can be a few ulps
  // outside the boundary. Project only that tolerated roundoff back to |p|=1.
  if (normSquared > 1) {
    const inverseLength = 1 / Math.sqrt(normSquared);
    x *= inverseLength;
    y *= inverseLength;
    normSquared = 1;
  }

  return [x, y, normSquared];
}
