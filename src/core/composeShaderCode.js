// prefix -> (fragment stage -> composed source)
const composedByPrefix = new Map();

/**
 * Concatenates a shared WGSL prefix with a material's fragment stage,
 * memoized on both inputs. Shared by Material and Material2d.
 *
 * The renderers ask a material for its composed source on every draw to
 * look up its pipeline, so the composition must not allocate a fresh
 * multi-kilobyte string each time: this returns the one cached string,
 * whose engine-cached hash also keeps the per-draw pipeline and shader
 * module cache lookups cheap. Keying on the prefix keeps a customized
 * `Material.SHARED_WGSL` / `Material.INSTANCED_WGSL` working — a changed
 * prefix is simply a new cache entry.
 */
export function composeShaderCode(prefix, fragment) {
  let byFragment = composedByPrefix.get(prefix);
  if (!byFragment) {
    byFragment = new Map();
    composedByPrefix.set(prefix, byFragment);
  }
  let code = byFragment.get(fragment);
  if (code === undefined) {
    code = prefix + fragment;
    byFragment.set(fragment, code);
  }
  return code;
}
