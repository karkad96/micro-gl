# micro-gl project guidance

## Project intent

`micro-gl` is a small, dependency-free 2D and 3D WebGPU engine written as
ES modules. Keep the engine focused and understandable. Do not introduce a
framework, build step, WebGL fallback, or runtime dependency unless the user
explicitly asks for it.

The package's public API is exported from `src/index.js`. Update that entry
point and `README.md` when a public API changes.

## Read the smallest useful surface

- `src/core/`: contracts shared by both renderers, including WebGPU setup,
  layouts, textures, renderer configuration, and resource helpers.
- `src/math/`: allocation-light vector, matrix, frustum, and color utilities.
- `src/3d/`: 3D scene graph, renderer, cameras, lighting, shadows, materials,
  geometry, shaders, controls, and raycasting.
- `src/2d/`: 2D counterparts using Mat3 transforms, painter ordering, and no
  depth buffer.
- `test/`: Node unit and regression tests, usually with fake GPU objects.
- `test-browser/`: real-browser WebGPU pipeline and rendering coverage.
- `examples/`, `index.html`, `style.css`: repository demos.

Start with the files directly named by the task and their imports. Do not scan
the whole repository for a local change. If available, use the
`$micro-gl-maintenance` skill for the detailed architecture map and recurring
maintenance workflow.

## Architecture invariants

- Keep shared 2D/3D behavior in `src/core/`; keep dimension-specific behavior
  in its engine directory. Check the counterpart when changing a shared
  contract, but do not force symmetry where rendering behavior differs.
- Scene objects remain CPU-side data. Renderers and `GpuResources*` create GPU
  resources lazily and own their lifecycle explicitly.
- Geometry and textures may be shared. Preserve per-device caches, renderer
  ownership, revision-based uploads, and disposal/recreation behavior.
- Keep WGSL declarations, bind-group layouts, uniform writers, vertex layouts,
  and pipeline cache keys synchronized. Bind group 0 is frame data, group 1 is
  object/material data, and 3D group 2 is directional-shadow data.
- 3D uses depth testing, frustum culling, an optional shadow pass, and separate
  opaque/transparent ordering. 2D uses stable `zIndex` painter ordering,
  straight-alpha blending, and no depth attachment.
- Instanced object capacity defines fixed CPU/GPU allocation. `count` selects
  the active prefix, while revision flags coordinate uploads and bounds.
- Colors are authored as normalized sRGB arrays and converted to linear values
  for shading; sRGB render targets encode displayed output.

## Change workflow

- Inspect `git status` and the current branch before editing. Preserve unrelated
  user changes.
- Use a focused `feat/...`, `bugfix/...`, or `chore/...` branch when creating a
  branch for the task.
- For feature work, bug fixes, refactors, or reviews whose execution path
  reaches WebGPU or WGSL, use `$webgpu` alongside `$micro-gl-maintenance` and
  load only its task-relevant references. Treat micro-gl's established public
  behavior and ownership contracts as the local authority when generic advice
  differs.
- Make the smallest coherent change and add a regression test for changed
  behavior.
- Do not commit unless the user explicitly asks. When requested, propose a
  commit message after explaining the implementation.
- Follow the existing JavaScript style: explicit `.js` ESM imports, two-space
  indentation, semicolons, and single quotes as configured by Prettier.
- Avoid adding dependencies unless the task requires one and the user agrees.

## Verification

- Targeted Node test: `node --test test/<file>.test.js`
- Full Node suite on Windows: `npm.cmd test`
- Real WebGPU suite: `npm.cmd run test:webgpu`
- Demo server on Windows: `npx.cmd serve .`

Run the real WebGPU suite after changes to renderers, GPU resources, pipelines,
WGSL, bind groups, uniform layouts, vertex layouts, textures, or browser
lifecycle behavior. Before handoff, run `git diff --check` and review the final
status and diff. State exactly what passed and what was not run.
