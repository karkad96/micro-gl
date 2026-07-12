/**
 * Coordinates renderers that deliberately share one canvas configuration and
 * GPU device. Ownership moves to another live renderer when the original
 * owner is disposed, and the device is destroyed only after the last member.
 */

export function acquireDeviceLease(renderer, gpu, shared = null) {
  const sourceCanvas =
    shared?.canvas || gpu?.canvas || gpu?.context?.canvas || null;
  if (sourceCanvas && sourceCanvas !== renderer.canvas) {
    throw new Error('Shared renderers must use the same canvas');
  }
  if (!gpu?.device || !gpu.context || !gpu.format) {
    throw new Error('The shared renderer must be initialized before it is used');
  }

  if (shared?._deviceLease) {
    const lease = shared._deviceLease;
    lease.members.add(renderer);
    renderer._deviceLease = lease;
    renderer._ownsDevice = false;
    return lease;
  }

  const managed = !shared;
  const lease = {
    device: gpu.device,
    context: gpu.context,
    format: gpu.format,
    canvas: renderer.canvas,
    managed,
    members: new Set([renderer]),
  };
  renderer._deviceLease = lease;
  renderer._ownsDevice = managed;
  return lease;
}

/**
 * Releases one renderer's membership.
 * @returns {boolean} whether this renderer must destroy/unconfigure the device
 */
export function releaseDeviceLease(renderer) {
  const lease = renderer._deviceLease;
  renderer._deviceLease = null;

  // Supports renderers constructed manually in tests or older integrations.
  if (!lease) return !!renderer._ownsDevice;

  lease.members.delete(renderer);
  if (!lease.managed || !renderer._ownsDevice) return false;

  const successor = lease.members.values().next().value;
  if (successor) {
    successor._ownsDevice = true;
    renderer._ownsDevice = false;
    return false;
  }
  return true;
}
