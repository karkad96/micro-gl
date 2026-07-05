# micro-gl

A tiny three.js-style 3D engine written from scratch for **WebGPU only**, in plain
JavaScript ES modules — no build step, no dependencies. It also ships a real 2D
engine alongside the 3D one: a parallel set of classes built on 3x3 matrices
(`Vec2` positions, one rotation angle) instead of a 3D scene viewed top-down.

## Running the demo

WebGPU requires the page to be served over http(s) (opening `index.html` directly
from disk won't work because of ES modules). From this folder run one of:

```
npx serve .
# or
python -m http.server 8000
```

then open http://localhost:3000 (or :8000) in a WebGPU-capable browser
(Chrome/Edge 113+, recent Firefox/Safari versions).

The HUD buttons in the top-left corner pick which engine drives the
canvas: the **3D scene** or the **2D scene** (two separate scenes — the
2D one is not a view of the 3D objects). Alt + drag to orbit (or spin
the view in 2D), right-drag to pan (a plain right-click still opens the
context menu), scroll to zoom (toward the cursor). Click a shape to
select it, then drag to move it around. In the 3D scene, press **C** to
switch between perspective and orthographic cameras and **T** to toggle
a top-down view where Alt + drag spins the view around the vertical
axis (the scene always stays top-down).

## Project structure

The two engines mirror each other folder-for-folder, so if you know where
something lives in one, you know where it lives in the other. Only `math/`
and `core/` are shared.

```
index.html            demo page (canvas + HUD)
main.js               demo scenes (3D and 2D; HUD buttons swap engines)
src/
  index.js            single entry point that re-exports everything

  math/               shared by both engines
    Vec3.js           3-component vector
    Mat4.js           column-major 4x4 matrix (perspective, invert, compose, ...)
    Vec2.js           2-component vector
    Mat3.js           3x3 affine transform, stored in the padded column
                      layout WGSL uses for mat3x3f uniforms
  core/               shared WebGPU plumbing
    initWebGpu.js     adapter/device/canvas setup (one device per canvas —
                      renderers on the same canvas share it)

  3d/                 the 3D engine
    core/
      Object3d.js     scene-graph node: transform + children
      Scene.js        scene root, holds the background color
      Mesh.js         geometry + material
      Raycaster.js    pointer picking via ray vs. bounding-box tests
      Renderer.js     swap chain, depth buffer, render pass
      GpuResources.js lazy caches: pipelines, vertex/index/uniform buffers,
                      bind groups
    cameras/
      Camera.js       shared base: lookAt target + view/projection matrices
      PerspectiveCamera.js
      OrthographicCamera.js
    controls/
      OrbitControls.js  alt-drag-to-orbit / right-drag-to-pan / scroll-to-zoom
      DragControls.js   click-to-select and drag meshes around
    geometries/
      Geometry.js     base class (interleaved position/normal/uv vertices)
      BoxGeometry.js
      SphereGeometry.js
      PlaneGeometry.js  XZ ground plane facing +Y
    materials/
      Material.js     base class + shared WGSL vertex shader and uniform structs
      BasicMaterial.js  unlit flat color
      LambertMaterial.js diffuse shading from a DirectionalLight + ambient
    lights/
      DirectionalLight.js
      AmbientLight.js

  2d/                 the 2D engine — flat counterparts of the 3D classes
    core/
      Object2d.js     scene-graph node: Vec2 position, one rotation angle,
                      zIndex draw order
      Scene2d.js      scene root, holds the background color
      Shape2d.js      geometry + material (the 2D Mesh)
      Renderer2d.js   no depth buffer: zIndex sorting + alpha blending
      GpuResources2d.js lazy caches for the 2D pipelines and buffers
    cameras/
      Camera2d.js     pan/zoom/rotation as a single Mat3, no perspective
    controls/
      PanZoomControls.js  right-drag-to-pan / scroll-to-zoom / alt-drag-to-spin
      DragControls2d.js   click-to-select and drag shapes around
    geometries/
      Geometry2d.js   base class (interleaved position/uv vertices) +
                      containsPoint for raycaster-free picking
      RectGeometry.js
      CircleGeometry.js
    materials/
      Material2d.js   base class + shared WGSL vertex shader and uniform structs
      BasicMaterial2d.js  flat color, alpha-blended
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

## How the WebGPU pieces fit together

- **Renderer.init()** requests the GPU adapter and device, configures the canvas
  context, and creates the bind group layouts and the per-frame uniform buffer.
- **Uniforms** are split into two bind groups, matching the WGSL in
  `Material.js`:
  - `@group(0)` _frame_ uniforms — view-projection matrix, light direction/color,
    ambient color. Written once per frame.
  - `@group(1)` _object_ uniforms — model matrix, normal matrix, color. Each
    mesh gets its own small uniform buffer and bind group (created lazily on
    first draw).
- **Pipelines** are compiled once per material class and cached, so any number
  of meshes sharing a material class reuse the same `GPURenderPipeline`.
- **Geometries** upload one interleaved vertex buffer (position, normal, uv —
  32-byte stride) and one 32-bit index buffer, lazily on first draw.
- **render()** updates world matrices, writes the uniforms, records a single
  render pass with a `depth24plus` depth attachment, and submits it.

## Deliberate limitations (it's _micro_)

- One directional light + ambient; no shadows, no textures yet.
- Cameras orient via `lookAt` target, not via their `rotation` Euler angles.
- Opaque rendering only in 3D (no blending/transparency sorting); the 2D
  engine does blend, using painter's-algorithm zIndex sorting instead of a
  depth buffer.

Natural next steps if you want to grow it: textures + samplers (a
`TextureMaterial`), point lights, a wireframe/grid helper, and shadow mapping.
