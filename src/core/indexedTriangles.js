import {
  DEFAULT_PRIMITIVE_TOPOLOGY,
  isTriangleTopology,
} from './pipelineConstants.js';

const UINT32_PRIMITIVE_RESTART = 0xffffffff;

/**
 * Visits indexed triangles in the same order and winding as WebGPU.
 * Returning true from `visit` stops traversal early.
 */
export function forEachIndexedTriangle(indices, topology, visit) {
  if (topology === DEFAULT_PRIMITIVE_TOPOLOGY) {
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
      if (visit(indices[offset], indices[offset + 1], indices[offset + 2])) {
        return true;
      }
    }
    return false;
  }

  if (!isTriangleTopology(topology)) return false;

  let first = null;
  let second = null;
  let triangleIndex = 0;
  for (const index of indices) {
    if (index === UINT32_PRIMITIVE_RESTART) {
      first = null;
      second = null;
      triangleIndex = 0;
      continue;
    }
    if (first === null) {
      first = index;
      continue;
    }
    if (second === null) {
      second = index;
      continue;
    }

    const stopped =
      triangleIndex % 2 === 0
        ? visit(first, second, index)
        : visit(second, first, index);
    if (stopped) return true;
    first = second;
    second = index;
    triangleIndex++;
  }
  return false;
}
