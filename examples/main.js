import {
  AmbientLight,
  DirectionalLight,
  GridHelper,
  LambertMaterial,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Renderer,
  Scene,
  OrbitControls,
  SphereGeometry,
} from '../src/index.js';

import { Simulation } from '../particle-test/Simulation.js';
import { VectorField } from '../particle-test/VectorField.js';

const PARTICLE_COUNT = 18;
const PARTICLE_RADIUS = 0.22;
const PARTICLE_SPAWN_RADIUS = 3;
const MIN_PARTICLE_SEPARATION = 0.75;
const SIMULATION_STEP = 1 / 120;
const MAX_FRAME_DELTA = 0.05;

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

function setupSimulationSpeedControl() {
  const input = document.getElementById('simulation-speed');
  const output = document.getElementById('simulation-speed-value');

  function updateOutput() {
    const speed = input.valueAsNumber;
    output.value = speed === 0 ? 'Paused' : `${speed.toFixed(1)}×`;
    input.setAttribute(
      'aria-valuetext',
      speed === 0 ? 'Paused' : `${speed.toFixed(1)} times`,
    );
  }

  input.addEventListener('input', updateOutput);
  updateOutput();
  return input;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomParticlePosition(occupiedPositions) {
  const minimumDistanceSquared =
    MIN_PARTICLE_SEPARATION * MIN_PARTICLE_SEPARATION;

  for (let attempt = 0; attempt < 200; attempt++) {
    const position = {
      x: randomBetween(-PARTICLE_SPAWN_RADIUS, PARTICLE_SPAWN_RADIUS),
      y: randomBetween(0.5, 4),
      z: randomBetween(-PARTICLE_SPAWN_RADIUS, PARTICLE_SPAWN_RADIUS),
    };

    const isSeparated = occupiedPositions.every((other) => {
      const dx = position.x - other.x;
      const dy = position.y - other.y;
      const dz = position.z - other.z;
      return dx * dx + dy * dy + dz * dz >= minimumDistanceSquared;
    });

    if (isSeparated) {
      return position;
    }
  }

  throw new Error('Could not find a separated particle starting position');
}

function createParticleSimulation(scene) {
  const geometry = new SphereGeometry(PARTICLE_RADIUS, 20, 14);
  const particleTypes = [
    {
      charge: 1,
      material: new LambertMaterial({ color: [1, 0, 0] }),
    },
    {
      charge: -1,
      material: new LambertMaterial({ color: [0, 0, 1] }),
    },
    {
      charge: 0,
      material: new LambertMaterial({ color: [1, 1, 0] }),
    },
  ];
  const occupiedPositions = [];
  const particles = [];

  for (let index = 0; index < PARTICLE_COUNT; index++) {
    const type = particleTypes[index % particleTypes.length];
    const position = randomParticlePosition(occupiedPositions);
    const particle = new Mesh(geometry, type.material);

    particle.charge = type.charge;
    particle.position.set(position.x, position.y, position.z);
    scene.add(particle);

    occupiedPositions.push(position);
    particles.push(particle);
  }

  const simulation = new Simulation(particles, {
    coulombConstant: 0.16,
    softening: PARTICLE_RADIUS * 1.5,
  });

  return simulation;
}

async function main() {
  const canvas = document.getElementById('canvas');
  const speedControl = setupSimulationSpeedControl();

  const renderer = new Renderer(canvas, {
    autoResize: true,
  });

  await renderer.init();

  const scene = new Scene();

  const ambientLight = new AmbientLight([1, 1, 1], 0.4);
  const directionalLight = new DirectionalLight([1, 1, 1], 1);
  directionalLight.direction.set(-1, -2, -1);
  scene.add(ambientLight);
  scene.add(directionalLight);

  const vectorField = new VectorField(6, 4, 6, [0.2, 0.08, 0.25]);
  for (const state of vectorField.states) {
    state.scale.set(0.3, 0.3, 0.3);
  }
  scene.add(vectorField);

  // size, divisions, RGB color
  const grid = new GridHelper(20, 20, [0.3, 0.3, 0.35]);
  scene.add(grid);

  const simulation = createParticleSimulation(scene);

  const aspect = window.innerWidth / window.innerHeight;

  const perspCamera = new PerspectiveCamera(60, aspect, 0.1, 100);
  perspCamera.position.set(7, 5, 8);
  perspCamera.lookAt(0, 1.5, 0);

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
    orthoCamera.size =
      controls.radius * Math.tan((perspCamera.fov * Math.PI) / 360);
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
      Math.max(
        visibleHalfHeight / Math.tan(perspectiveHalfFov),
        controls.minRadius,
      ),
      controls.maxRadius,
    );
    controls.update();
  }

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 't' || event.repeat) {
      return;
    }

    if (activeCamera === orthoCamera) {
      switchToPerspective();
    } else {
      switchToOrthographic();
    }
  });

  const updateFpsHud = createFpsHud();
  let lastTime = performance.now();
  let simulationTime = 0;

  function render(time) {
    const dt = Math.min((time - lastTime) / 1000, MAX_FRAME_DELTA);
    lastTime = time;

    const simulationSpeed = speedControl.valueAsNumber;
    simulationTime += dt * simulationSpeed;
    while (simulationTime >= SIMULATION_STEP) {
      simulation.step(SIMULATION_STEP);
      simulationTime -= SIMULATION_STEP;
    }

    controls.update();

    vectorField.update(dt * simulationSpeed);
    renderer.render(scene, activeCamera);

    updateFpsHud(time, renderer.drawCount);

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
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
