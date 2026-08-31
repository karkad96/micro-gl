/** One complete turn in radians. */
export const TAU = Math.PI * 2;

/** Wraps a finite angle to the stable range [0, 2 PI). */
export function wrapAngle(angle) {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}
