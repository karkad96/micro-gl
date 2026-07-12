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
    Vec2.js           2-component vector
    Mat3.js           3x3 affine transform, stored in the padded column
                      layout WGSL uses for mat3x3f uniforms
    color.js          sRGB <-> linear conversion helpers (colors are
                      authored in sRGB, shaded in linear)
  core/               shared WebGPU plumbing
    initWebGpu.js     adapter/device/canvas setup (one device per canvas —
                      renderers on the same canvas share it)
    Texture.js        an image + sampler settings; assign to a material's
                      `map` (uploaded lazily, shareable across engines)
    uploadTexture.js  creates + caches the GPU texture/view/sampler for a
                      Texture (shared by both engines' GpuResources)
    generateMipmaps.js fills a texture's mip chain with a tiny render
                      pass per level (WebGPU has no built-in way)
    PointerControls.js the pointer/wheel/touch gesture plumbing shared by
                      the camera controls (subclasses provide the camera
                      math); touch: one-finger drag, two-finger pan,
                      pinch zoom

  3d/                 the 3D engine
    core/
      Object3d.js     scene-graph node: transform + children
      Scene.js        scene root, holds the background color
      Mesh.js         geometry + material
      InstancedMesh.js  a mesh drawn N times in one call, each instance
                      with its own transform + color
      Raycaster.js    pointer picking via ray vs. bounding-box tests
      Renderer.js     swap chain, depth buffer, render pass
      Pipelines.js    bind group layouts + one cached render pipeline per
                      material class and pipeline state
      GpuResources.js lazy caches: vertex/index/uniform buffers, bind groups
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
    materials/
      Material.js     base class + shared WGSL vertex shader and uniform structs
      BasicMaterial.js  unlit flat color
      LambertMaterial.js diffuse shading from a DirectionalLight + ambient
      TextureMaterial.js LambertMaterial with a texture `map` for the
                      surface color
    lights/
      DirectionalLight.js
      AmbientLight.js
      PointLight.js   a lamp: radiates from its scene-graph position,
                      fading with distance (up to 4 per scene)
    helpers/
      GridHelper.js   a line grid in the XZ plane — the usual ground
                      reference while building a scene

  2d/                 the 2D engine — flat counterparts of the 3D classes
    core/
      Object2d.js     scene-graph node: Vec2 position, one rotation angle,
                      zIndex draw order
      Scene2d.js      scene root, holds the background color
      Shape2d.js      geometry + material (the 2D Mesh)
      InstancedShape2d.js  the 2D InstancedMesh
      Renderer2d.js   no depth buffer: zIndex sorting + alpha blending
      Pipelines2d.js  the 2D pipeline cache (alpha blending, no depth)
      GpuResources2d.js lazy caches for the 2D buffers and bind groups
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
    materials/
      Material2d.js   base class + shared WGSL vertex shader and uniform structs
      BasicMaterial2d.js  flat color, alpha-blended
      SpriteMaterial2d.js texture `map` times color — the 2D sprite

test/                 unit tests for the math and scene-graph classes
                      (Node's built-in test runner, no dependencies)
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
   by a scene traversal — are written into the `@group(0)` uniform
   buffer.
4. A single render pass begins, clearing the color target and the
   depth buffer. By default both are 4x multisampled and the color
   resolves to the canvas when the pass ends (`antialias: false`
   renders straight to the canvas instead).
5. The scene is traversed and visible meshes are collected (an object
   with `visible = false` is skipped along with its whole subtree —
   hiding a group hides everything in it): opaque ones
   draw first in scene order, then transparent ones
   (`material.transparent`) draw back-to-front by view-space depth —
   the 3D counterpart of the 2D `zIndex` sort. For each mesh:
   - `GpuResources` hands back the geometry's vertex/index buffers, the
     mesh's uniform buffer + bind group, and the material's pipeline
     (from `Pipelines`) — each created on first use and cached after;
   - the model matrix, normal matrix and color are written into the
     mesh's `@group(1)` uniform buffer;
   - the pass sets the pipeline, bind group and buffers, and issues one
     `drawIndexed` (with the instance count for an `InstancedMesh`).
6. The pass ends and the command buffer is submitted to the GPU queue.

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
  with it to release what it owns.
- **Uniforms** are split into two bind groups, matching the WGSL in
  `Material.js`:
  - `@group(0)` _frame_ uniforms — view-projection matrix, light direction/color,
    ambient color, and up to `MAX_POINT_LIGHTS` (4) point lights (world
    position + color). Written once per frame.
  - `@group(1)` _object_ uniforms — model matrix, normal matrix, color. Each
    mesh gets its own small uniform buffer and bind group (created lazily on
    first draw). Materials with a `map` use a second layout that adds the
    texture view and sampler to the same group.
- **Pipelines** are compiled once per material class + pipeline state
  (primitive topology, culling, textured / instanced / transparent or
  not) and cached, so any number of meshes sharing a material class reuse
  the same `GPURenderPipeline`. Transparent variants alpha-blend and
  don't write the depth buffer.
- **Geometries** upload one interleaved vertex buffer (position, normal, uv —
  32-byte stride) and one 32-bit index buffer, lazily on first draw.
- **Textures** upload once with a full mip chain (generated level by level
  with a tiny render pass — `generateMipmaps.js`) and get a sampler from
  the Texture's settings. Image textures upload as `rgba8unorm-srgb`, so
  sampling and mip filtering happen in linear space.
- **Color space**: the colors you author (material, light and instance
  colors) are sRGB display values. The renderer decodes them to linear
  (`srgbToLinear`), all shading happens in linear space, and every
  fragment shader encodes the result back to sRGB at the end — unlit
  colors round-trip exactly, lit and textured surfaces shade correctly.
- **Geometries** are uploaded once and cached; edit `vertices`/`indices`
  in place and set `geometry.needsUpdate = true` to re-upload (the
  arrays must keep their length).
- **Instancing**: an `InstancedMesh` packs per-instance transform + color
  into a second, instance-stepped vertex buffer and draws all instances
  with one `drawIndexed` — thousands of objects for a couple of draw calls.
- **render()** updates world matrices, writes the uniforms, records a single
  render pass with a `depth24plus` depth attachment, and submits it. With
  the default `antialias: true`, the pass draws into 4x multisampled
  color/depth targets and resolves to the swap chain — the sample count is
  baked into every cached pipeline.

## Tests

The math and scene-graph classes are covered by unit tests built on
Node's built-in test runner — no dependencies:

```
npm test
```

Everything GPU-side is verified by running the demo (there is nothing to
mock: the value of a renderer is what it puts on screen).

## Deliberate limitations (it's _micro_)

- One directional light, up to four point lights, and ambient; no shadows.
- Cameras orient via `lookAt` target, not via their `rotation` Euler angles.
- Transparent meshes sort back-to-front by their origin's depth, not per
  triangle, so intersecting or nested transparent meshes can blend in the
  wrong order.
- Per-instance non-uniform scale skews instanced lighting normals (the
  shader uses the instance matrix directly instead of its inverse
  transpose).

The natural next step if you want to grow it: shadow mapping.
