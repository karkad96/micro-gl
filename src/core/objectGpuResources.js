const orphanedResourceRegistry = new FinalizationRegistry(
  ({ owner, resourceRef }) => {
    owner._objectGpuResourceRefs.delete(resourceRef);
  },
);

/**
 * Registers one manager-owned GPU record without strongly retaining the
 * record or its scene object. Their normal garbage-collection fallback stays
 * intact when an application drops a transient object without dispose().
 */
export function trackObjectGpuResource(owner, object, gpu) {
  gpu.owner = owner;
  gpu.objectRef = new WeakRef(object);
  gpu.resourceRef = new WeakRef(gpu);
  gpu.disposed = false;
  owner._objectGpuResourceRefs.add(gpu.resourceRef);
  orphanedResourceRegistry.register(
    gpu,
    { owner, resourceRef: gpu.resourceRef },
    gpu.resourceRef,
  );
}

/** Destroys one mesh/shape record and unregisters it from its owner. */
export function destroyObjectGpuResource(gpu) {
  if (!gpu || gpu.disposed) return;
  gpu.uniformBuffer.destroy();
  if (gpu.instanceBuffer) gpu.instanceBuffer.destroy();
  gpu.disposed = true;
  if (gpu.resourceRef) {
    orphanedResourceRegistry.unregister(gpu.resourceRef);
    if (gpu.owner) {
      gpu.owner._objectGpuResourceRefs.delete(gpu.resourceRef);
    }
  }
  gpu.owner = null;
  gpu.resourceRef = null;
}

/** Releases all renderer-manager records attached to one scene object. */
export function disposeObjectGpuResources(object) {
  if (!object._gpu) return;
  for (const gpu of object._gpu.values()) destroyObjectGpuResource(gpu);
  object._gpu = null;
}

/**
 * Releases only the records owned by one resource manager. Other renderers'
 * cache entries on the same scene objects remain valid.
 */
export function disposeOwnedObjectGpuResources(owner) {
  for (const resourceRef of [...owner._objectGpuResourceRefs]) {
    const gpu = resourceRef.deref();
    if (!gpu) {
      orphanedResourceRegistry.unregister(resourceRef);
      owner._objectGpuResourceRefs.delete(resourceRef);
      continue;
    }
    const object = gpu.objectRef.deref();
    destroyObjectGpuResource(gpu);
    if (object?._gpu?.get(owner) === gpu) {
      object._gpu.delete(owner);
      if (object._gpu.size === 0) object._gpu = null;
    }
  }
  owner._objectGpuResourceRefs.clear();
}
