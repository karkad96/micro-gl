# micro-gl

A small, dependency-free WebGPU engine for 2D and 3D browser graphics.

**WebGPU only · ES modules · zero runtime dependencies · 2D and 3D**

`micro-gl` provides a scene graph, cameras, geometry, materials, lighting,
textures, controls, picking, shadows, and instanced rendering without bringing
in a large framework.

## Features

- Separate 2D and 3D renderers with a familiar scene/object model
- Perspective, orthographic, and 2D cameras
- Built-in geometry, materials, textures, transparency, and MSAA
-  , ambient, and point lights with directional shadows
- Scene hierarchies, frustum culling, raycasting, and drag controls
- Instanced 2D and 3D drawing for large object counts
- Mouse, touch, and trackpad camera controls
- Correct sRGB texture and color handling

## Install

```sh
npm install micro-gl
```

The package is ESM-only:

```js
import { Renderer, Scene, Mesh } from 'micro-gl';
```

Use a browser development server or bundler such as Vite, Rollup, webpack, or
Parcel so the `micro-gl` import can be resolved from `node_modules`.

## 3D quick start

Add a full-page canvas:

```html
<style>
  html,
  body,
  #canvas {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  #canvas {
    display: block;
  }
</style>

<canvas id="canvas"></canvas>
<script type="module" src="/src/main.js"></script>
```

Create a scene in `src/main.js`:

```js
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  LambertMaterial,
  Mesh,
  OrbitControls,
  PerspectiveCamera,
  Renderer,
  Scene,
} from 'micro-gl';

const canvas = document.querySelector('#canvas');
const renderer = new Renderer(canvas, { autoResize: true });
await renderer.init();

const scene = new Scene();
scene.background = [0.04, 0.05, 0.08, 1];

const cube = new Mesh(
  new BoxGeometry(),
  new LambertMaterial({ color: [1, 0.35, 0.1] }),
);
scene.add(cube);

const sun = new DirectionalLight([1, 1, 1], 1);
sun.direction.set(-1, -2, -1);
scene.add(sun);
scene.add(new AmbientLight([1, 1, 1], 0.25));

const camera = new PerspectiveCamera(60);
camera.position.set(3, 2, 4);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);

function frame(time) {
  cube.rotation.y = time * 0.001;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

Use <kbd>Alt</kbd> + left-drag to orbit, right-drag to pan, and the mouse
wheel or a pinch gesture to zoom.

## 2D quick start

The 2D API uses the same scene/renderer pattern with flat transforms and
`zIndex` ordering:

```js
import {
  BasicMaterial2d,
  Camera2d,
  RectGeometry,
  Renderer2d,
  Scene2d,
  Shape2d,
} from 'micro-gl';

const canvas = document.querySelector('#canvas');
const renderer = new Renderer2d(canvas, { autoResize: true });
await renderer.init();

const scene = new Scene2d();
scene.background = [0.04, 0.05, 0.08, 1];

const rectangle = new Shape2d(
  new RectGeometry(2, 1),
  new BasicMaterial2d({ color: [0.2, 0.7, 1] }),
);
scene.add(rectangle);

const camera = new Camera2d(4);

function frame(time) {
  rectangle.rotation = time * 0.001;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

## API overview

### 3D

- **Scene and objects:** `Scene`, `Object3d`, `Mesh`, `InstancedMesh`
- **Cameras:** `PerspectiveCamera`, `OrthographicCamera`
- **Geometry:** `BoxGeometry`, `SphereGeometry`, `PlaneGeometry`,
  `WireframeGeometry`, `Geometry`
- **Materials:** `BasicMaterial`, `LambertMaterial`, `TextureMaterial`
- **Lighting:** `DirectionalLight`, `AmbientLight`, `PointLight`
- **Interaction:** `OrbitControls`, `DragControls`, `Raycaster`
- **Helpers:** `GridHelper`

### 2D

- **Scene and objects:** `Scene2d`, `Object2d`, `Shape2d`, `InstancedShape2d`
- **Camera:** `Camera2d`
- **Geometry:** `RectGeometry`, `CircleGeometry`, `Geometry2d`
- **Materials:** `BasicMaterial2d`, `SpriteMaterial2d`
- **Interaction:** `PanZoomControls`, `DragControls2d`

### Shared

- `Texture` loads image assets for both engines
- `Vec2`, `Vec3`, `Mat3`, and `Mat4` provide transform math
- Colors use arrays of normalized sRGB values: `[r, g, b]` or
  `[r, g, b, alpha]`

Load a texture with:

```js
import { Texture, TextureMaterial } from 'micro-gl';

const texture = await Texture.load('/assets/texture.png');
const material = new TextureMaterial({ map: texture });
```

For a 2D sprite, use `SpriteMaterial2d` and usually pass `{ flipY: true }`
when loading the texture.

## Browser requirements

- A browser with WebGPU support
- HTTPS or `localhost`; WebGPU is unavailable in an insecure context
- A development server; opening the HTML file directly is not supported

There is no WebGL fallback. You can check support before starting:

```js
if (!navigator.gpu) {
  throw new Error('This browser does not support WebGPU.');
}
```

## Current scope

`micro-gl` is intentionally small. It currently supports one directional
light with one directional shadow map, up to four point lights, ambient light,
and batch-level culling for instanced objects. Physics, audio, animation
systems, model loaders, and a WebGL fallback are outside the engine's current
scope.

## Run the repository demo

```sh
npm install
npx serve .
```

Open `http://localhost:3000`. The demo can switch between the 2D and 3D
renderers and includes interaction and stress tests.

## Tests

```sh
npm test
npm run test:webgpu
```

`npm test` runs the Node unit and regression suite. `npm run test:webgpu`
uses an installed Chrome or Edge browser to compile and render the real WebGPU
pipelines.
