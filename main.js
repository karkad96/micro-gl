import {
  Renderer,
  Scene,
  Mesh,
  Object3D,
  PerspectiveCamera,
  OrthographicCamera,
  OrbitControls,
  DragControls,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  BasicMaterial,
  LambertMaterial,
  DirectionalLight,
  AmbientLight,
  Renderer2D,
  Scene2D,
  Shape2D,
  Object2D,
  Camera2D,
  PanZoomControls,
  DragControls2D,
  RectGeometry,
  CircleGeometry,
  BasicMaterial2D,
} from './src/index.js';

async function main() {
  const canvas = document.getElementById('canvas');
  const renderer = new Renderer(canvas);
  await renderer.init();

  // The 2D renderer drives the same canvas, so it shares the 3D
  // renderer's GPU device instead of requesting its own.
  const renderer2d = new Renderer2D(canvas);
  await renderer2d.init(renderer);

  // --- 3D scene ------------------------------------------------------------
  const scene = new Scene();
  scene.background = [0.05, 0.06, 0.09, 1];

  const sun = new DirectionalLight([1, 1, 0.95], 1);
  sun.direction.set(-1, -2, -1);
  scene.add(sun);

  scene.add(new AmbientLight([0.4, 0.45, 0.6], 0.35));

  // Ground plane.
  const ground = new Mesh(
    new PlaneGeometry(12, 12),
    new LambertMaterial({ color: [0.35, 0.37, 0.4] }),
  );
  scene.add(ground);

  // Spinning cube.
  const cube = new Mesh(
    new BoxGeometry(1, 1, 1),
    new LambertMaterial({ color: [0.9, 0.45, 0.15] }),
  );
  cube.position.set(-1.2, 0.5, 0);
  scene.add(cube);

  // Sphere.
  const sphere = new Mesh(
    new SphereGeometry(0.75, 32, 20),
    new LambertMaterial({ color: [0.2, 0.65, 0.7] }),
  );
  sphere.position.set(1.4, 0.75, 0);
  scene.add(sphere);

  // A small unlit satellite parented to a rotating pivot,
  // to show the scene graph in action.
  const pivot = new Object3D();
  pivot.position.copy(cube.position);
  scene.add(pivot);

  const satellite = new Mesh(
    new BoxGeometry(0.25, 0.25, 0.25),
    new BasicMaterial({ color: [1, 0.9, 0.3] }),
  );
  satellite.position.set(1.1, 0.4, 0);
  pivot.add(satellite);

  // --- 2D scene ------------------------------------------------------------
  // A genuinely flat scene: Vec2 positions, one rotation angle, Mat3
  // transforms, zIndex draw order and alpha blending.
  const scene2d = new Scene2D();
  scene2d.background = [0.07, 0.08, 0.12, 1];

  const card = new Shape2D(
    new RectGeometry(3, 2),
    new BasicMaterial2D({ color: [0.9, 0.45, 0.15] }),
  );
  card.position.set(-2, 0.5);
  card.rotation = 0.2;
  scene2d.add(card);

  const disc = new Shape2D(
    new CircleGeometry(1, 48),
    new BasicMaterial2D({ color: [0.2, 0.65, 0.7] }),
  );
  disc.position.set(2, -0.5);
  scene2d.add(disc);

  // Semi-transparent, drawn on top of the card and disc — shows off
  // zIndex ordering and alpha blending.
  const overlay = new Shape2D(
    new RectGeometry(2.5, 2.5),
    new BasicMaterial2D({ color: [0.85, 0.3, 0.5, 0.55] }),
  );
  overlay.position.set(0.3, 0);
  overlay.zIndex = 1;
  scene2d.add(overlay);

  // A satellite parented to a rotating pivot orbiting the disc —
  // the 2D scene graph in action.
  const pivot2d = new Object2D();
  pivot2d.position.copy(disc.position);
  scene2d.add(pivot2d);

  const satellite2d = new Shape2D(
    new RectGeometry(0.4, 0.4),
    new BasicMaterial2D({ color: [1, 0.9, 0.3] }),
  );
  satellite2d.position.set(1.6, 0);
  satellite2d.zIndex = 2;
  pivot2d.add(satellite2d);

  // --- Cameras + controls --------------------------------------------------
  const perspCamera = new PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  perspCamera.position.set(4, 3, 5);
  perspCamera.lookAt(0, 0.5, 0);

  const orthoCamera = new OrthographicCamera(
    4,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  orthoCamera.position.copy(perspCamera.position);
  // Share the same target so orbiting stays in sync across both cameras.
  orthoCamera.target = perspCamera.target;

  let camera = perspCamera;
  const controls = new OrbitControls(camera, canvas);

  const camera2d = new Camera2D(4, window.innerWidth / window.innerHeight);
  const controls2d = new PanZoomControls(camera2d, canvas);

  // --- Selection + dragging ------------------------------------------------
  // Click an object to select it (it brightens), drag to move it.
  const dragControls = new DragControls([cube, sphere], camera, canvas);
  const dragControls2d = new DragControls2D(
    [card, disc, overlay],
    camera2d,
    canvas,
  );

  // The highlight logic is engine-agnostic: both drag controls hand
  // over an object with a `material.color`.
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
  brightenOnSelect(dragControls);
  brightenOnSelect(dragControls2d);

  dragControls.onDragStart = () => {
    controls.enabled = false;
    canvas.style.cursor = 'grabbing';
  };
  dragControls.onDragEnd = () => {
    controls.enabled = !engine2D;
    canvas.style.cursor = '';
  };
  dragControls.onDrag = (mesh) => {
    // Keep the satellite orbiting around the cube.
    if (mesh === cube) pivot.position.copy(cube.position);
  };

  dragControls2d.onDragStart = () => {
    controls2d.enabled = false;
    canvas.style.cursor = 'grabbing';
  };
  dragControls2d.onDragEnd = () => {
    controls2d.enabled = engine2D;
    canvas.style.cursor = '';
  };
  dragControls2d.onDrag = (shape) => {
    // Keep the satellite orbiting around the disc.
    if (shape === disc) pivot2d.position.copy(disc.position);
  };

  // --- Engine switching ------------------------------------------------------
  // The HUD buttons pick which engine drives the canvas. Both engines'
  // controls listen on the same canvas; only the active engine's are
  // enabled.
  const btn3d = document.getElementById('btn-3d');
  const btn2d = document.getElementById('btn-2d');

  let engine2D = false;
  function setEngine(is2D) {
    engine2D = is2D;
    controls.enabled = !is2D;
    dragControls.enabled = !is2D;
    controls2d.enabled = is2D;
    dragControls2d.enabled = is2D;
    btn3d.classList.toggle('active', !is2D);
    btn2d.classList.toggle('active', is2D);
  }
  btn3d.addEventListener('click', () => setEngine(false));
  btn2d.addEventListener('click', () => setEngine(true));
  // Open the page with #2d to start in the 2D engine.
  setEngine(location.hash === '#2d');

  // Keyboard shortcuts for the 3D view (ignored while the 2D engine is
  // active). Press C to switch between perspective and orthographic
  // cameras, T to toggle a top-down view: orthographic camera looking
  // straight down. Right-drag pans, scroll zooms, and Alt + drag spins
  // the view around the vertical axis — the scene always stays top-down.
  let topDown = false;
  let saved3D = null;
  window.addEventListener('keydown', (e) => {
    if (engine2D) return;
    if (e.key === 'c' || e.key === 'C') {
      if (topDown) return;
      camera = camera === perspCamera ? orthoCamera : perspCamera;
      controls.camera = camera;
      dragControls.camera = camera;
    } else if (e.key === 't' || e.key === 'T') {
      topDown = !topDown;
      if (topDown) {
        saved3D = {
          camera,
          phi: controls.phi,
          theta: controls.theta,
          minPhi: controls.minPhi,
          maxPhi: controls.maxPhi,
        };
        camera = orthoCamera;
        controls.camera = camera;
        controls.phi = 0;
        controls.theta = 0;
        // Lock the tilt so Alt + drag only spins around the vertical axis.
        controls.minPhi = 0;
        controls.maxPhi = 0;
      } else {
        camera = saved3D.camera;
        controls.camera = camera;
        controls.phi = saved3D.phi;
        controls.theta = saved3D.theta;
        controls.minPhi = saved3D.minPhi;
        controls.maxPhi = saved3D.maxPhi;
      }
      dragControls.camera = camera;
    }
  });

  // --- Resize --------------------------------------------------------------
  // Both renderers share the canvas; the 3D one also owns the depth
  // buffer, so its setSize does everything needed.
  renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Render loop ----------------------------------------------------------
  let lastTime = performance.now();
  function frame(time) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    cube.rotation.y += dt * 0.8;
    cube.rotation.x += dt * 0.3;
    pivot.rotation.y += dt * 1.5;
    satellite.rotation.z += dt * 3;

    pivot2d.rotation += dt * 1.5;
    satellite2d.rotation -= dt * 3;

    if (engine2D) {
      renderer2d.render(scene2d, camera2d);
    } else {
      controls.update();
      renderer.render(scene, camera);
    }
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
