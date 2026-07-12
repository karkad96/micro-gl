/**
 * Returns whether a material's shader declares texture-map bindings.
 *
 * `usesMap` describes the shader interface and deliberately does not depend
 * on the current value of `map`: changing a resource must not silently change
 * the pipeline layout. A textured material without its resource is therefore
 * reported as a clear application error before WebGPU validation runs.
 */
export function materialUsesMap(material) {
  if (!material.usesMap && !material.requiresMap) return false;
  if (material.map) return true;

  throw new Error(
    `${material.constructor.name}: \`map\` was cleared, but this material ` +
      'always samples its texture — assign a Texture or switch to a ' +
      'material without a map',
  );
}
