import {
  GridHelper,
  OrthographicCamera,
  PerspectiveCamera,
  Renderer,
  Scene,
  OrbitControls,
  SphereGeometry,
  LambertMaterial,
  Mesh,
} from '../src/index.js';

async function main() {
  const canvas = document.getElementById("canvas");

  const renderer = new Renderer(canvas, {
    autoResize: true,
  });

  await renderer.init();

  const scene = new Scene();

  const sphere = new Mesh(
    new SphereGeometry(1, 32, 20),
    new LambertMaterial({ color: [1, 0.0, 0.0] }),
  );

  scene.add(sphere);

  // size, divisions, RGB color
  const grid = new GridHelper(20, 20, [0.3, 0.3, 0.35]);
  scene.add(grid);

  const aspect = window.innerWidth / window.innerHeight;

  const perspCamera = new PerspectiveCamera(60, aspect, 0.1, 100);
  perspCamera.position.set(4, 3, 5);
  perspCamera.lookAt(0, 0.5, 0);


  const orthoCamera = new OrthographicCamera(5, aspect, 0.1, 100);
  let activeCamera = perspCamera;

  const controls = new OrbitControls(perspCamera, canvas);
  const perspectiveMinPhi = controls.minPhi;
  const perspectiveMaxPhi = controls.maxPhi;
  let perspectiveTheta = controls.theta;
  let perspectivePhi = controls.phi;
  let orthoTheta = 0;

  function switchToOrthographic() {
    perspectiveTheta = controls.theta;
    perspectivePhi = controls.phi;

    // Match the perspective view's current scale before changing projection.
    orthoCamera.size = controls.radius * Math.tan((perspCamera.fov * Math.PI) / 360);
    orthoCamera.zoom = 1;
    orthoCamera.lookAt(controls.target);

    activeCamera = orthoCamera;
    controls.camera = activeCamera;
    controls.target = activeCamera.target;
    controls.theta = orthoTheta;
    controls.phi = 0;
    controls.minPhi = 0;
    controls.maxPhi = 0;
    controls.enableRotate = true;
    controls.update();
  }

  function switchToPerspective() {
    orthoTheta = controls.theta;

    const visibleHalfHeight = orthoCamera.size / orthoCamera.zoom;
    const perspectiveHalfFov = (perspCamera.fov * Math.PI) / 360;

    perspCamera.lookAt(controls.target);
    activeCamera = perspCamera;
    controls.camera = activeCamera;
    controls.target = activeCamera.target;
    controls.theta = perspectiveTheta;
    controls.phi = perspectivePhi;
    controls.minPhi = perspectiveMinPhi;
    controls.maxPhi = perspectiveMaxPhi;
    controls.radius = Math.min(
      Math.max(visibleHalfHeight / Math.tan(perspectiveHalfFov), controls.minRadius),
      controls.maxRadius,
    );
    controls.update();
  }

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "t" || event.repeat) {
      return;
    }

    if (activeCamera === orthoCamera) {
      switchToPerspective();
    } else {
      switchToOrthographic();
    }
  });

  function render() {
    controls.update();
    renderer.render(scene, activeCamera);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main().catch(console.error);
