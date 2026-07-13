# micro-gl

A tiny three.js-style 3D engine written from scratch for **WebGPU only**, in plain
JavaScript ES modules — no build step, no dependencies. It also ships a real 2D
engine alongside the 3D one: a parallel set of classes built on 3x3 matrices
(`Vec2` positions, one rotation angle) instead of a 3D scene viewed top-down.

## Running it

This repo is the engine (`src/`) plus a bare demo page: `index.html`
loads a `main.js` next to it, which you provide — put one of the
[minimal usage](#minimal-usage) snippets below in it and you have a
running scene.

WebGPU requires the page to be served over http(s) (opening `index.html`
directly from disk won't work because of ES modules). From this folder:

```
npx serve .
```

then open http://localhost:3000 in a WebGPU-capable browser
(Chrome/Edge 113+, recent Firefox/Safari versions). Avoid Python's
`http.server` — on some systems it serves `.js` with a MIME type that
breaks ES module loading.

## Project structure

The two engines mirror each other folder-for-folder, so if you know where
something lives in one, you know where it lives in the other. Only `math/`
and `core/` are shared.

```
index.html            demo page shell (canvas + HUD elements); loads the
                      main.js you write your scene in
style.css             demo page styles
src/
  index.js            single entry point that re-exports everything

  math/               shared by both engines
    Vec3.js           3-component vector
    Mat4.js           column-major 4x4 matrix (perspective, invert, compose, ...)
    Frustum.js        WebGPU clip planes + transformed bounding-box tests
    Vec2.js           2-component vector
    Mat3.js           3x3 affine transform, stored in the padded column
                      layout WGSL uses for mat3x3f uniforms
    color.js          sRGB <-> linear conversion helpers (colors are
                      authored in sRGB, shaded in linear)
  core/               shared WebGPU plumbing
    initWebGpu.js     adapter/device/canvas setup (one device per canvas —
                      renderers on the same canvas share it)
    deviceLease.js    shared-renderer lifetime/ownership coordination
    objectGpuResources.js manager-local object-buffer disposal
    rendererConfig.js drawing-buffer, MSAA and attachment constants
    pipelineConstants.js shader bindings and shared pipeline-state names
    materialResources.js validates each material's resource contract
    createMaterialPipelineLayouts.js shared 2D/3D bind-group layouts
    Texture.js        an image + sampler settings; assign to a material's
                      `map` (uploaded lazily, shareable across devices)
    uploadTexture.js  caches one GPU texture/view/sampler per device
    generateMipmaps.js fills a texture's mip chain with a tiny render
                      pass per level (WebGPU has no built-in way)
    PointerControls.js the pointer/wheel/touch gesture plumbing shared by
                      the camera controls (subclasses provide the camera
                      math); touch: one-finger drag, two-finger pan,
                      pinch zoom

  3d/                 the 3D engine
    constants.js      limits shared by CPU layouts and WGSL
    core/
      Object3d.js     scene-graph node: transform + children
      Scene.js        scene root, holds the background color
      Mesh.js         geometry + material
      InstancedMesh.js  a mesh drawn N times in one call, each instance
                      with its own transform + color
      InstancedBounds.js cached union bounds for an instanced batch
      Raycaster.js    pointer picking via ray vs. bounding-box tests
      Renderer.js     swap chain, depth buffer, render pass
      Pipelines.js    bind group layouts + pipelines cached by composed
                      shader source and fixed-function state
      DirectionalShadowMap.js renderer-owned shadow texture + depth pass
      ShadowPipelines.js vertex-only shadow pipeline cache
      GpuResources.js lazy caches: vertex/index/uniform buffers, bind groups
      Uniforms.js     named CPU/WGSL layouts + 3D frame-uniform writer
    cameras/
      Camera.js       shared base: lookAt target + view/projection matrices
      PerspectiveCamera.js
      OrthographicCamera.js
    controls/
      OrbitControls.js  alt-drag-to-orbit / right-drag-to-pan /
                      scroll-to-zoom; touch: one-finger orbit,
                      two-finger pan, pinch zoom
      DragControls.js   click-to-select and drag meshes around
    geometries/
      Geometry.js     base class (interleaved position/normal/uv vertices)
      BoxGeometry.js
      SphereGeometry.js
      PlaneGeometry.js  XZ ground plane facing +Y
      WireframeGeometry.js  the unique edges of any triangle geometry,
                      for drawing with a line-list material
    shaders/
      shared.js       uniform structs, lighting and color-space helpers
      vertexStages.js regular + instanced vertex stages
      fragments.js    reusable material fragment stages
      shadows.js      regular + instanced directional depth shader
      vertexLayout.js matching GPU vertex attribute descriptors
    materials/
      Material.js     material options + shader-stage composition
      BasicMaterial.js  unlit flat color
      LambertMaterial.js diffuse shading from a DirectionalLight + ambient
      TextureMaterial.js LambertMaterial with a texture `map` for the
                      surface color
    lights/
      DirectionalLight.js
      DirectionalShadow.js shadow-map and orthographic-camera settings
      AmbientLight.js
      PointLight.js   a lamp: radiates from its scene-graph position,
                      fading with distance (up to 4 per scene)
    helpers/
      GridHelper.js   a line grid in the XZ plane — the usual ground
                      reference while building a scene

  2d/                 the 2D engine — flat counterparts of the 3D classes
    constants.js      shared instance-layout size
    core/
      Object2d.js     scene-graph node: Vec2 position, one rotation angle,
                      zIndex draw order
      Scene2d.js      scene root, holds the background color
      Shape2d.js      geometry + material (the 2D Mesh)
      InstancedShape2d.js  the 2D InstancedMesh
      Renderer2d.js   no depth buffer: zIndex sorting + alpha blending
      Pipelines2d.js  the 2D pipeline cache (alpha blending, no depth)
      GpuResources2d.js lazy caches for the 2D buffers and bind groups
      Uniforms2d.js   named padded Mat3/object uniform layouts
    cameras/
      Camera2d.js     pan/zoom/rotation as a single Mat3, no perspective
    controls/
      PanZoomControls.js  right-drag-to-pan / scroll-to-zoom /
                      alt-drag-to-spin; touch: drag to pan, pinch to zoom
      DragControls2d.js   click-to-select and drag shapes around
    geometries/
      Geometry2d.js   base class (interleaved position/uv vertices) +
                      containsPoint for raycaster-free picking
      RectGeometry.js
      CircleGeometry.js
    shaders/          2D uniform chunks, vertex stages, fragments and
                      matching GPU vertex layouts
    materials/
      Material2d.js   material options + shader-stage composition
      BasicMaterial2d.js  flat color, alpha-blended
      SpriteMaterial2d.js texture `map` times color — the 2D sprite

test/                 unit/regression tests plus small GPU-device fakes
                      (the unit suite uses only Node built-ins)
test-browser/         real WebGPU smoke fixture + installed-browser runner
```

## Minimal usage

```js
import {
  Renderer,
  Scene,
  Mesh,
  PerspectiveCamera,
  BoxGeometry,
  LambertMaterial,
  DirectionalLight,
  AmbientLight,
} from './src/index.js';

const renderer = new Renderer(document.querySelector('canvas'));
await renderer.init();

const scene = new Scene();
scene.add(new DirectionalLight([1, 1, 1], 1));
scene.add(new AmbientLight([1, 1, 1], 0.25));

const cube = new Mesh(
  new BoxGeometry(),
  new LambertMaterial({ color: [1, 0.4, 0.1] }),
);
scene.add(cube);

const camera = new PerspectiveCamera(60, innerWidth / innerHeight);
camera.position.set(3, 2, 4);
camera.lookAt(0, 0, 0);

renderer.setSize(innerWidth, innerHeight);
function frame() {
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

## Directional shadows

Shadow mapping is opt-in on both the light and each mesh, so adding a light
does not silently add another render pass. Continuing the scene above (with
`PlaneGeometry` added to its imports):

```js
const sun = new DirectionalLight([1, 1, 1], 1);
sun.direction.set(-1, -2, -1); // direction the light travels
sun.castShadow = true;
sun.shadow.mapSize = 1024;
sun.shadow.bias = 0.001;
sun.shadow.normalBias = 0.02;
sun.shadow.camera.size = 8;    // half-height of the square covered area
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 30;
sun.shadow.camera.lookAt(0, 0, 0); // center the covered area
scene.add(sun);

cube.castShadow = true;
cube.receiveShadow = true;

const ground = new Mesh(
  new PlaneGeometry(10, 10),
  new LambertMaterial({ color: [0.4, 0.4, 0.4] }),
);
ground.receiveShadow = true;
scene.add(ground);
```

The first visible `DirectionalLight` is the scene's sun and the only light that
can own the directional shadow map. Its camera bounds are fixed in world space;
move the camera target or increase `size`/`far` when casters fall outside them.
Opaque regular and instanced triangle meshes can cast. Line, point and
transparent materials are skipped by the shadow pass; lit transparent meshes
may still receive shadows.

## Frustum culling

The 3D renderer automatically skips meshes whose transformed geometry bounds
are completely outside the active camera. Shadow casters are tested separately
against the directional light's camera, so an off-screen object can still cast
a visible shadow. `drawCount` and `shadowDrawCount` report only the instances
actually submitted to their respective passes.

Set `mesh.frustumCulled = false` when a custom vertex shader moves vertices
beyond `geometry.bounds`, or when a mesh must render regardless of the camera:

```js
mesh.frustumCulled = false;
```

An `InstancedMesh` is culled conservatively as one batch. Its cached bound is
the union of every instance transform: if any instance may be visible, the
whole fixed-count batch draws. Split very large, spatially separate instance
sets into several `InstancedMesh` objects for more precise culling. Direct
matrix edits still require `mesh.needsUpdate = true`, which also refreshes the
cached batch bound.

## Minimal 2D usage

```js
import {
  Renderer2d,
  Scene2d,
  Shape2d,
  Camera2d,
  RectGeometry,
  BasicMaterial2d,
} from './src/index.js';

const renderer = new Renderer2d(document.querySelector('canvas'));
await renderer.init();
// (to share a canvas with a 3D Renderer, init that first and pass it:
//  await renderer2d.init(renderer3d) — one GPU device per canvas)

const scene = new Scene2d();
const box = new Shape2d(
  new RectGeometry(2, 1),
  new BasicMaterial2d({ color: [1, 0.4, 0.1] }),
);
scene.add(box);

const camera = new Camera2d(4, innerWidth / innerHeight);

renderer.setSize(innerWidth, innerHeight);
function frame() {
  box.rotation += 0.01;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

## How a frame happens

One `renderer.render(scene, camera)` call, start to finish:

1. `scene.updateWorldMatrix()` recomposes every object's local matrix
   from its position/rotation/scale and multiplies down the tree, so
   each object ends up with an up-to-date `worldMatrix`.
2. `camera.updateMatrices()` rebuilds the projection and view matrices
   and their product, the view-projection matrix.
3. The frame uniforms — the view-projection matrix plus the lights found
   by a scene traversal — are written into the `@group(0)` uniform buffer.
4. The main camera's frustum and, when shadows are enabled, the directional
   light camera's frustum are refreshed. One scene traversal independently
   collects color-visible meshes and light-visible shadow casters. An object
   with `visible = false` is skipped along with its whole subtree.
5. The union of both lists has its geometry, instance data and object uniforms
   prepared. Camera-culled objects that do not cast a visible shadow therefore
   remain lazily unuploaded.
6. When directional shadows are enabled, a single-sample depth-only pass
   renders the opted-in opaque triangle casters into the light's shadow map.
   The map is still cleared when there are no visible casters, preventing
   stale shadows.
7. The color pass clears its color and depth targets. By default both are 4x
   multisampled and color resolves to the canvas when the pass ends
   (`antialias: false` renders straight to the canvas instead). Opaque meshes
   draw first in scene order, then transparent meshes draw back-to-front by
   view-space depth — the 3D counterpart of the 2D `zIndex` sort. For each:
   - `GpuResources` hands back the geometry's vertex/index buffers, the
     mesh's uniform buffer + bind group, and the material's pipeline
     (from `Pipelines`) — each created on first use and cached after;
   - the already-prepared model matrix, normal matrix, color and shadow
     receiver flag are read from the mesh's `@group(1)` uniform buffer;
   - the pass sets the pipeline, bind group and buffers, and issues one
     `drawIndexed` (with the instance count for an `InstancedMesh`).
8. The pass ends and both passes are submitted in one command buffer.

`Renderer2d` follows the same shape minus the depth buffer: visible
shapes are collected, sorted by `zIndex`, and drawn back-to-front with
alpha blending on.

## How the WebGPU pieces fit together

- **Renderer.init()** requests the GPU adapter and device, configures the canvas
  context, and creates the bind group layouts and the per-frame uniform buffer.
  If the device is ever lost (driver reset, GPU process crash), a console
  error explains how to recover. Construct with
  `new Renderer(canvas, { autoResize: true })` to have `setSize` follow the
  canvas's CSS size automatically, and call `renderer.dispose()` when done
  with it to release what it owns. Renderers initialized through
  `renderer2d.init(renderer3d)` share a managed device lease: disposing the
  original transfers ownership, and the last live renderer destroys the
  device. Each renderer also refreshes stale attachments if its shared canvas
  was resized by the other one. Sharing is intended for alternating 2D/3D
  scenes; each `render()` starts with a clear, so it is not an overlay/compositor
  API.
- **3D uniforms and sampled shadows** use three bind groups, matching the
  declarations in `3d/shaders/shared.js` (the 2D counterpart uses the first
  two):
  - `@group(0)` _frame_ uniforms — view-projection matrix, light direction/color,
    ambient color, and up to `MAX_POINT_LIGHTS` (4) point lights (world
    position + color). Written once per frame.
  - `@group(1)` _object_ uniforms — model matrix, normal matrix, color and
    shadow receiver flag. Each mesh gets its own small uniform buffer and bind
    group (created lazily on first draw). Materials that declare
    `usesMap: true` use a second layout
    that adds the texture view and sampler to the same group. This declaration
    is independent of the current `map` value, so swapping a resource cannot
    accidentally change the shader's pipeline layout. Custom material classes
    should pass it explicitly; when omitted, it is inferred once from the
    initial `map` for compatibility.
  - `@group(2)` _directional shadow_ resources — light view-projection
    matrix, bias settings, sampled depth texture and comparison sampler.
    The color pass always binds it; when shadows are disabled a tiny fallback
    map and an `enabled = 0` flag keep every material on one stable layout.
- **Pipelines** are compiled once per composed shader + pipeline state
  (primitive topology, culling, textured / instanced / transparent or
  not) and cached, so materials producing the same WGSL reuse the same
  `GPURenderPipeline`. Transparent variants alpha-blend and
  don't write the depth buffer.
- **Shaders** are ordinary JavaScript ES modules under each
  engine's `shaders/` directory. Shared declarations, vertex stages, fragment
  stages and their matching vertex layouts are separate, while material
  classes only hold options and select a fragment stage. This keeps WGSL out
  of the public-facing classes without requiring raw-file imports or a build
  tool.
- **Resources** are scoped to their real WebGPU owner. Geometry buffers and
  textures are cached per `GPUDevice`; object uniform buffers and bind groups
  are cached per renderer resource manager because their layouts belong to
  that manager. Disposing a renderer removes only its entries and buffers;
  other renderers' entries remain valid. The same scene data can therefore be
  rendered on independent canvases/devices.
- **Geometries** upload one interleaved vertex buffer (position, normal, uv —
  32-byte stride) and one 32-bit index buffer per device, lazily on first draw.
  Their cached local bounding boxes drive raycasting and frustum culling.
  Edit `vertices`/`indices` in place and set `geometry.needsUpdate = true`; a
  revision counter ensures every device receives the edit (the arrays must
  keep their length).
- **Textures** upload per device with a full mip chain (generated level by level
  with a tiny render pass — `generateMipmaps.js`) and get a sampler from
  the Texture's settings. Image textures upload as `rgba8unorm-srgb`, so
  sampling and mip filtering happen in linear space.
- **Color space**: the colors you author (material, light and instance
  colors) are sRGB display values. The renderer decodes them to linear
  (`srgbToLinear`), all shading happens in linear space, and every
  fragment shader encodes the result back to sRGB at the end — unlit
  colors round-trip exactly, lit and textured surfaces shade correctly.
- **Instancing**: an `InstancedMesh` packs per-instance transform + color
  into a second, instance-stepped vertex buffer and draws all instances
  with one `drawIndexed` — thousands of objects for a couple of draw calls.
  Instance revisions keep every renderer synchronized and guarantee that a
  buffer recreated after `dispose()` is populated before drawing. A separate
  bounds revision avoids rebuilding the batch bound after color-only edits.
- **Frustum culling** extracts the six WebGPU clip planes once per camera and
  tests local bounding boxes through their world transforms without allocating
  corner vectors or inverting matrices. Invalid/custom bounds fail open rather
  than risk hiding geometry. Color and directional-shadow passes use different
  frusta.
- **render()** updates world matrices, writes the uniforms, optionally records
  a single-sample `depth32float` directional shadow pass, records the color
  pass with a `depth24plus` depth attachment, and submits them together. With
  the default `antialias: true`, the pass draws into 4x multisampled
  color/depth targets and resolves to the swap chain — the sample count is
  baked into every cached pipeline.

## Tests

Math, scene graphs, controls, resource lifecycles, shader composition and
pipeline descriptors are covered with Node's built-in test runner and small
GPU fakes:

```
npm test
```

After `npm install`, the opt-in browser suite uses `playwright-core` to drive an
installed Chrome or Edge browser without downloading another browser binary:

```
npm run test:webgpu
```

It compiles every stock regular/instanced WGSL module, renders the 2D and 3D
material, texture, transparency, topology and directional-shadow variants
through both 1x and 4x pipelines, and exercises frustum culling across camera
resizes. It checks WebGPU error scopes and uncaptured errors, exercises shared
renderer resizing/disposal, and reads known pixels back through a GPU buffer.
The command reports a skip when no browser or WebGPU adapter is available; set
`MICRO_GL_REQUIRE_WEBGPU=1` in CI to turn that into a failure.

Set `MICRO_GL_BROWSER_PATH` to use a non-standard Chrome/Edge location,
`MICRO_GL_HEADED=1` to watch the test, or `MICRO_GL_BROWSER_ARGS` to a JSON
array of additional launch flags when a CI GPU setup needs them.

## Deliberate limitations (it's _micro_)

- One directional light (and one fixed-bounds directional shadow map), up to
  four point lights, and ambient. Shadow casting is limited to opaque triangle
  meshes; there are no point-light, transparent or alpha-cutout shadows.
- Cameras orient via `lookAt` target, not via their `rotation` Euler angles.
- Transparent meshes sort back-to-front by their origin's depth, not per
  triangle, so intersecting or nested transparent meshes can blend in the
  wrong order.
- Per-instance non-uniform scale skews instanced lighting normals (the
  shader uses the instance matrix directly instead of its inverse
  transpose).
- Instanced frustum culling is all-or-none per batch; it does not compact
  individual visible instances into a temporary GPU buffer.

The natural next step if you want to grow it: spatial partitioning and broader
material/shadow models.
