import {
  Renderer,
  Scene,
  Mesh,
  Object3d,
  PerspectiveCamera,
  OrthographicCamera,
  OrbitControls,
  DragControls,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  BasicMaterial,
  LambertMaterial,
  TextureMaterial,
  DirectionalLight,
  AmbientLight,
  Texture,
  Renderer2d,
  Scene2d,
  Shape2d,
  Object2d,
  Camera2d,
  PanZoomControls,
  DragControls2d,
  RectGeometry,
  CircleGeometry,
  BasicMaterial2d,
  SpriteMaterial2d,
} from './src/index.js';
import { createStressTest, STRESS_LEVELS } from './stress.js';

async function main() {
  const canvas = document.getElementById('canvas');

  // The 2D renderer drives the same canvas, so it shares the 3D
  // renderer's GPU device instead of requesting its own.
  const renderer = new Renderer(canvas);
  await renderer.init();
  const renderer2d = new Renderer2d(canvas);
  await renderer2d.init(renderer);

  // One texture serves both engines: their renderers share a GPU device,
  // so the checkerboard is uploaded once and sampled by both.
  const checker = makeCheckerTexture();
  const world = buildScene3D(checker);
  const world2d = buildScene2D(checker);

  const view = createView(canvas);
  setupDragging(view, world, world2d);
  setupEngineButtons(view);
  setupCameraShortcuts(view);
  const stress = setupStressButton(world.scene, world2d.scene);

  // Both renderers share the canvas; the 3D one also owns the depth
  // buffer, so its setSize does everything needed.
  renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  startRenderLoop(renderer, renderer2d, world, world2d, view, stress);
}

/**
 * A white/gray checkerboard drawn with the 2D canvas API — a texture
 * without shipping image assets. White squares so material `color`
 * tints show through.
 */
function makeCheckerTexture(squares = 8, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cell = size / squares;
  for (let y = 0; y < squares; y++) {
    for (let x = 0; x < squares; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#9a9a9a' : '#ffffff';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return new Texture(canvas);
}

/**
 * The 3D scene: a lit ground plane, a textured cube and a sphere, plus
 * a small unlit satellite parented to a rotating pivot to show the
 * scene graph in action.
 */
function buildScene3D(checker) {
  const scene = new Scene();
  scene.background = [0.05, 0.06, 0.09, 1];

  const sun = new DirectionalLight([1, 1, 0.95], 1);
  sun.direction.set(-1, -2, -1);
  scene.add(sun);
  scene.add(new AmbientLight([0.4, 0.45, 0.6], 0.35));

  const ground = new Mesh(
    new PlaneGeometry(12, 12),
    new LambertMaterial({ color: [0.35, 0.37, 0.4] }),
  );
  scene.add(ground);

  const cube = new Mesh(
    new BoxGeometry(1, 1, 1),
    new TextureMaterial({ map: checker, color: [0.9, 0.45, 0.15] }),
  );
  cube.position.set(-1.2, 0.5, 0);
  scene.add(cube);

  const sphere = new Mesh(
    new SphereGeometry(0.75, 32, 20),
    new LambertMaterial({ color: [0.2, 0.65, 0.7] }),
  );
  sphere.position.set(1.4, 0.75, 0);
  scene.add(sphere);

  const pivot = new Object3d();
  pivot.position.copy(cube.position);
  scene.add(pivot);

  const satellite = new Mesh(
    new BoxGeometry(0.25, 0.25, 0.25),
    new BasicMaterial({ color: [1, 0.9, 0.3] }),
  );
  satellite.position.set(1.1, 0.4, 0);
  pivot.add(satellite);

  return { scene, cube, sphere, pivot, satellite };
}

/**
 * The 2D scene — genuinely flat: Vec2 positions, one rotation angle,
 * Mat3 transforms, zIndex draw order and alpha blending. Mirrors the 3D
 * scene: textured card + disc, and a satellite on a rotating pivot.
 */
function buildScene2D(checker) {
  const scene = new Scene2d();
  scene.background = [0.07, 0.08, 0.12, 1];

  const card = new Shape2d(
    new RectGeometry(3, 2),
    new SpriteMaterial2d({ map: checker, color: [0.9, 0.45, 0.15] }),
  );
  card.position.set(-2, 0.5);
  card.rotation = 0.2;
  scene.add(card);

  const disc = new Shape2d(
    new CircleGeometry(1, 48),
    new BasicMaterial2d({ color: [0.2, 0.65, 0.7] }),
  );
  disc.position.set(2, -0.5);
  scene.add(disc);

  // Semi-transparent, drawn on top of the card and disc — shows off
  // zIndex ordering and alpha blending.
  const overlay = new Shape2d(
    new RectGeometry(2.5, 2.5),
    new BasicMaterial2d({ color: [0.85, 0.3, 0.5, 0.55] }),
  );
  overlay.position.set(0.3, 0);
  overlay.zIndex = 1;
  scene.add(overlay);

  const pivot = new Object2d();
  pivot.position.copy(disc.position);
  scene.add(pivot);

  const satellite = new Shape2d(
    new RectGeometry(0.4, 0.4),
    new BasicMaterial2d({ color: [1, 0.9, 0.3] }),
  );
  satellite.position.set(1.6, 0);
  satellite.zIndex = 2;
  pivot.add(satellite);

  return { scene, card, disc, overlay, pivot, satellite };
}

/**
 * Everything that tracks what the user is looking at: the cameras, the
 * camera controls, and which engine / 3D camera is currently active.
 * Handlers all over this file change that state, so it lives in one
 * object whose two methods keep every dependent flag in sync.
 */
function createView(canvas) {
  const aspect = window.innerWidth / window.innerHeight;

  const perspCamera = new PerspectiveCamera(60, aspect, 0.1, 100);
  perspCamera.position.set(4, 3, 5);
  perspCamera.lookAt(0, 0.5, 0);

  const orthoCamera = new OrthographicCamera(4, aspect, 0.1, 100);
  orthoCamera.position.copy(perspCamera.position);
  // Share the same target so orbiting stays in sync across both cameras.
  orthoCamera.target = perspCamera.target;

  const camera2d = new Camera2d(4, aspect);

  return {
    canvas,
    engine2D: false,
    camera: perspCamera, // the active 3D camera
    perspCamera,
    orthoCamera,
    camera2d,
    controls: new OrbitControls(perspCamera, canvas),
    controls2d: new PanZoomControls(camera2d, canvas),
    dragControls: null, // assigned by setupDragging
    dragControls2d: null,

    /**
     * Picks which engine drives the canvas. Both engines' controls
     * listen on the same canvas; only the active engine's are enabled.
     * Re-run with the current value to restore the flags after a drag.
     */
    setEngine(is2D) {
      this.engine2D = is2D;
      this.controls.enabled = !is2D;
      this.dragControls.enabled = !is2D;
      this.controls2d.enabled = is2D;
      this.dragControls2d.enabled = is2D;
    },

    /** Switches the active 3D camera everywhere it is referenced. */
    setCamera(camera) {
      this.camera = camera;
      this.controls.camera = camera;
      this.dragControls.camera = camera;
    },
  };
}

/**
 * Click an object to select it (it brightens), drag to move it. The
 * wiring is the same for both engines: pause the camera controls while
 * dragging and restore the active engine's controls on release.
 */
function setupDragging(view, world, world2d) {
  view.dragControls = new DragControls(
    [world.cube, world.sphere],
    view.camera,
    view.canvas,
  );
  view.dragControls2d = new DragControls2d(
    [world2d.card, world2d.disc, world2d.overlay],
    view.camera2d,
    view.canvas,
  );

  // Keep each satellite orbiting the object it is anchored to.
  wireDrag(view, view.dragControls, (mesh) => {
    if (mesh === world.cube) world.pivot.position.copy(mesh.position);
  });
  wireDrag(view, view.dragControls2d, (shape) => {
    if (shape === world2d.disc) world2d.pivot.position.copy(shape.position);
  });
}

function wireDrag(view, drag, onDrag) {
  brightenOnSelect(drag);
  drag.onDrag = onDrag;
  drag.onDragStart = () => {
    view.controls.enabled = false;
    view.controls2d.enabled = false;
    view.canvas.style.cursor = 'grabbing';
  };
  drag.onDragEnd = () => {
    view.setEngine(view.engine2D); // restores the active engine's controls
    view.canvas.style.cursor = '';
  };
}

// The highlight logic is engine-agnostic: both drag controls hand over
// an object with a `material.color`.
function brightenOnSelect(drag) {
  let original = null;
  drag.onSelect = (object) => {
    if (original) {
      original.object.material.color = original.color;
      original = null;
    }
    if (object) {
      original = { object, color: object.material.color };
      object.material.color = object.material.color.map((c, i) =>
        i < 3 ? Math.min(1, c * 1.4 + 0.15) : c,
      );
    }
  };
}

/** The HUD buttons (or opening the page with #2d) pick the active engine. */
function setupEngineButtons(view) {
  const btn3d = document.getElementById('btn-3d');
  const btn2d = document.getElementById('btn-2d');

  function pick(is2D) {
    view.setEngine(is2D);
    btn3d.classList.toggle('active', !is2D);
    btn2d.classList.toggle('active', is2D);
  }
  btn3d.addEventListener('click', () => pick(false));
  btn2d.addEventListener('click', () => pick(true));
  pick(location.hash === '#2d');
}

/**
 * Keyboard shortcuts for the 3D view (ignored while the 2D engine is
 * active). Press C to switch between perspective and orthographic
 * cameras, T to toggle a top-down view: orthographic camera looking
 * straight down. Right-drag pans, scroll zooms, and Alt + drag spins
 * the view around the vertical axis — the scene always stays top-down.
 */
function setupCameraShortcuts(view) {
  let topDown = null; // saved camera + orbit state while in top-down view
  window.addEventListener('keydown', (e) => {
    if (view.engine2D) return;
    const key = e.key.toLowerCase();
    if (key === 'c' && !topDown) {
      view.setCamera(
        view.camera === view.perspCamera ? view.orthoCamera : view.perspCamera,
      );
    } else if (key === 't') {
      if (topDown) {
        exitTopDown(view, topDown);
        topDown = null;
      } else {
        topDown = enterTopDown(view);
      }
    }
  });
}

/** Saves the current camera + orbit state and looks straight down. */
function enterTopDown(view) {
  const { controls } = view;
  const saved = {
    camera: view.camera,
    phi: controls.phi,
    theta: controls.theta,
    minPhi: controls.minPhi,
    maxPhi: controls.maxPhi,
  };
  view.setCamera(view.orthoCamera);
  controls.phi = 0;
  controls.theta = 0;
  // Lock the tilt so Alt + drag only spins around the vertical axis.
  controls.minPhi = 0;
  controls.maxPhi = 0;
  return saved;
}

function exitTopDown(view, saved) {
  view.setCamera(saved.camera);
  view.controls.phi = saved.phi;
  view.controls.theta = saved.theta;
  view.controls.minPhi = saved.minPhi;
  view.controls.maxPhi = saved.maxPhi;
}

/**
 * The Stress button cycles through object counts; both engines get
 * stressed at once, so switching engines compares them at the same load.
 */
function setupStressButton(scene, scene2d) {
  const stress = createStressTest(scene, scene2d);
  const button = document.getElementById('btn-stress');
  let index = 0;
  button.addEventListener('click', () => {
    index = (index + 1) % STRESS_LEVELS.length;
    const level = STRESS_LEVELS[index];
    stress.setLevel(level);
    button.textContent = 'Stress: ' + (level ? level.toLocaleString() : 'off');
    button.classList.toggle('active', level > 0);
  });
  return stress;
}

/**
 * FPS readout, sampled over ~250 ms windows: frames per second, average
 * frame time and how many objects the active engine drew.
 */
function createFpsHud() {
  const value = document.getElementById('fps-value');
  const detail = document.getElementById('fps-detail');
  let frames = 0;
  let windowStart = performance.now();

  return function update(time, drawCount) {
    frames++;
    const elapsed = time - windowStart;
    if (elapsed < 250) return;

    const fps = (frames * 1000) / elapsed;
    value.textContent = Math.round(fps);
    value.style.color =
      fps >= 50 ? '#7ddf8f' : fps >= 30 ? '#e8c76a' : '#ef8080';
    detail.textContent =
      (elapsed / frames).toFixed(1) +
      ' ms · ' +
      drawCount.toLocaleString() +
      ' objects';

    frames = 0;
    windowStart = time;
  };
}

function startRenderLoop(renderer, renderer2d, world, world2d, view, stress) {
  const updateFpsHud = createFpsHud();
  let lastTime = performance.now();

  function frame(time) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    world.cube.rotation.y += dt * 0.8;
    world.cube.rotation.x += dt * 0.3;
    world.pivot.rotation.y += dt * 1.5;
    world.satellite.rotation.z += dt * 3;

    world2d.pivot.rotation += dt * 1.5;
    world2d.satellite.rotation -= dt * 3;

    stress.update(dt, view.engine2D);

    if (view.engine2D) {
      renderer2d.render(world2d.scene, view.camera2d);
    } else {
      view.controls.update();
      renderer.render(world.scene, view.camera);
    }
    updateFpsHud(
      time,
      view.engine2D ? renderer2d.drawCount : renderer.drawCount,
    );
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  const el = document.getElementById('error');
  el.style.display = 'block';
  el.textContent =
    'Failed to start the WebGPU demo:\n\n' +
    err.message +
    '\n\nWebGPU needs a recent Chrome / Edge (or Firefox with it enabled), ' +
    'and the page must be served over http(s) — e.g. run "npx serve ." in this folder.';
  console.error(err);
});
