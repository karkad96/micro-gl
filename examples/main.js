import {
  ArcOutlineGeometry,
  BasicMaterial2d,
  Camera2d,
  CircleGeometry,
  CircleOutlineGeometry,
  Geometry2d,
  InstancedShape2d,
  Mat3,
  Object2d,
  PanZoomControls,
  Renderer2d,
  Scene2d,
  Shape2d,
} from '../src/index.js';
import { poincareToKlein } from './hyperbolicModels.js';
import { createRationalGeodesicSpecs } from './rationalGeodesics.js';

const DEMO = Object.freeze({
  denominatorLimit: 3,
  minimumPointCount: 3,
  arcSegments: 48,
  boundarySegments: 128,
  markerSegments: 16,
  markerRadius: 0.018,
  cameraSize: 1.25,
});
const UNIT_RADIUS = 1;
const LINE_TOPOLOGY = 'line-list';
const DISK_MODEL = Object.freeze({
  POINCARE: 'poincare',
  KLEIN: 'klein',
});
const numberFormatter = new Intl.NumberFormat();

async function main() {
  const canvas = document.querySelector('#canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('The demo requires a canvas with id="canvas".');
  }

  const renderer = new Renderer2d(canvas, { autoResize: true });
  await renderer.init();

  let controls = null;
  let scene = null;
  let disposeModelSelector = () => {};
  let animationFrame = 0;
  try {
    const demo = createDemoScene();
    scene = demo.scene;
    const camera = new Camera2d(DEMO.cameraSize);
    controls = new PanZoomControls(camera, canvas);
    disposeModelSelector = setupModelSelector(demo.stats, demo.setModel);
    console.info('micro-gl rational hyperbolic geodesic demo', demo.stats);

    const render = () => {
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);

    let disposed = false;
    globalThis.addEventListener('pagehide', (event) => {
      // A page kept in the back/forward cache resumes the same renderer.
      if (event.persisted || disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      disposeModelSelector();
      controls.dispose();
      scene.dispose();
      renderer.dispose();
    });
  } catch (error) {
    disposeModelSelector();
    controls?.dispose();
    scene?.dispose();
    renderer.dispose();
    throw error;
  }
}

function createDemoScene() {
  const scene = new Scene2d();
  scene.background = [0.025, 0.03, 0.055, 1];

  const { points, arcs, diameters, stats } = createRationalGeodesicSpecs(
    DEMO.denominatorLimit,
    { minimumPointCount: DEMO.minimumPointCount },
  );
  const geodesicAlpha = Math.min(
    0.55,
    4 / Math.sqrt(Math.max(1, stats.geodesicCount)),
  );
  const geodesicMaterial = new BasicMaterial2d({
    color: [0.18, 0.95, 0.42, geodesicAlpha],
    topology: LINE_TOPOLOGY,
  });
  const poincareLayer = new Object2d();
  const kleinLayer = new Object2d();
  scene.add(poincareLayer);
  scene.add(kleinLayer);

  if (arcs.length > 0) {
    const arcLines = new Shape2d(createArcGeometry(arcs), geodesicMaterial);
    arcLines.zIndex = -1;
    poincareLayer.add(arcLines);
  }

  if (diameters.length > 0) {
    const diameterLines = new Shape2d(
      createLineGeometry(diameters),
      geodesicMaterial,
    );
    diameterLines.zIndex = -1;
    poincareLayer.add(diameterLines);
  }

  const kleinLines = new Shape2d(
    createLineGeometry([...arcs, ...diameters]),
    geodesicMaterial,
  );
  kleinLines.zIndex = -1;
  kleinLayer.add(kleinLines);

  const boundary = new Shape2d(
    new CircleOutlineGeometry(UNIT_RADIUS, DEMO.boundarySegments),
    new BasicMaterial2d({
      color: [1, 0.2, 0.18],
      topology: LINE_TOPOLOGY,
    }),
  );
  boundary.zIndex = 1;
  scene.add(boundary);

  const markerRadius = Math.min(
    DEMO.markerRadius,
    0.25 / stats.denominatorLimit ** 2,
  );
  const markerGeometry = new CircleGeometry(markerRadius, DEMO.markerSegments);
  const markerMaterial = new BasicMaterial2d({ color: [0.2, 0.48, 1] });
  poincareLayer.add(
    createPointMarkers(
      points.map(({ position }) => position),
      markerGeometry,
      markerMaterial,
      markerRadius,
    ),
  );
  kleinLayer.add(
    createPointMarkers(
      points.map(({ position }) => poincareToKlein(position)),
      markerGeometry,
      markerMaterial,
      markerRadius,
    ),
  );

  const setModel = (model) => {
    if (!Object.values(DISK_MODEL).includes(model)) {
      throw new RangeError(`Unknown disk model: ${model}`);
    }
    poincareLayer.visible = model === DISK_MODEL.POINCARE;
    kleinLayer.visible = model === DISK_MODEL.KLEIN;
  };
  setModel(DISK_MODEL.POINCARE);

  return { scene, stats, setModel };
}

function setupModelSelector(stats, setModel) {
  const inputs = Array.from(
    document.querySelectorAll('input[name="disk-model"]'),
  );
  if (
    inputs.length !== Object.keys(DISK_MODEL).length ||
    inputs.some((input) => !(input instanceof HTMLInputElement))
  ) {
    throw new Error('The demo requires Poincaré and Klein model controls.');
  }

  const update = () => {
    const model = inputs.find(({ checked }) => checked)?.value;
    if (!model) throw new Error('Select a hyperbolic disk model.');
    setModel(model);
    updateHud(stats, model);
  };
  inputs.forEach((input) => input.addEventListener('change', update));
  update();

  return () => {
    inputs.forEach((input) => input.removeEventListener('change', update));
  };
}

function updateHud(stats, model) {
  const tripleSymbol = document.querySelector('#triple-symbol');
  const tripleCount = document.querySelector('#triple-count');
  const geodesicDetail = document.querySelector('#geodesic-detail');
  const geodesicFilter = document.querySelector('#geodesic-filter');
  const geodesicLabel = document.querySelector('#geodesic-label');
  const pointLabel = document.querySelector('#point-label');
  const modelExplanation = document.querySelector('#model-explanation');
  const isKlein = model === DISK_MODEL.KLEIN;

  if (tripleSymbol) {
    tripleSymbol.textContent = `T(${numberFormatter.format(
      stats.denominatorLimit,
    )})`;
  }
  if (tripleCount) {
    tripleCount.textContent = numberFormatter.format(stats.orderedTripleCount);
  }
  if (geodesicDetail) {
    geodesicDetail.textContent = `${numberFormatter.format(
      stats.geodesicCount,
    )} unique geodesics (\u2265 ${numberFormatter.format(
      stats.minimumPointCount,
    )} points each) \u00b7 ${numberFormatter.format(
      stats.pointCount,
    )} source rational points`;
  }
  if (geodesicFilter) {
    geodesicFilter.textContent = isKlein
      ? `${numberFormatter.format(stats.geodesicCount)} straight chords \u00b7 ` +
        `mapped from source q \u2264 ${numberFormatter.format(stats.denominatorLimit)}`
      : `${numberFormatter.format(stats.curvedGeodesicCount)} orthogonal arcs \u00b7 ` +
        `${numberFormatter.format(stats.diameterGeodesicCount)} diameters \u00b7 ` +
        `source q \u2264 ${numberFormatter.format(stats.denominatorLimit)}`;
  }
  if (geodesicLabel) {
    geodesicLabel.textContent = isKlein ? 'Straight chords' : 'Orthogonal arcs';
  }
  if (pointLabel) {
    pointLabel.textContent = isKlein ? 'Mapped points' : 'Rational points';
  }
  if (modelExplanation) {
    modelExplanation.textContent = isKlein
      ? 'K(p) = 2p / (1 + |p|\u00b2) maps the same points and geodesics to straight chords.'
      : 'Poincaré geodesics are boundary-orthogonal arcs; diameters are the straight special case.';
  }
}

function createArcGeometry(arcs) {
  const vertices = [];
  const indices = [];

  for (const { center, start, end, largeArc } of arcs) {
    const geometry = ArcOutlineGeometry.fromPoints({
      center,
      start,
      end,
      largeArc,
      segments: DEMO.arcSegments,
    });
    const vertexOffset = vertices.length / 4;
    vertices.push(...geometry.vertices);
    for (const index of geometry.indices) {
      indices.push(vertexOffset + index);
    }
  }

  return new Geometry2d(vertices, indices);
}

function createLineGeometry(lines) {
  const vertices = lines.flatMap(({ start, end }) => [
    ...start,
    0,
    0,
    ...end,
    1,
    1,
  ]);
  const indices = lines.flatMap((_, index) => [index * 2, index * 2 + 1]);
  return new Geometry2d(vertices, indices);
}

function createPointMarkers(positions, geometry, material, markerRadius) {
  const markers = new InstancedShape2d(geometry, material, positions.length);
  const markerMatrix = new Mat3();
  const markerPosition = { x: 0, y: 0 };
  const markerScale = { x: 1, y: 1 };
  positions.forEach(([x, y], index) => {
    const boundaryClearance = Math.max(0, UNIT_RADIUS - Math.hypot(x, y));
    const scale = Math.min(1, (0.65 * boundaryClearance) / markerRadius);
    markerPosition.x = x;
    markerPosition.y = y;
    markerScale.x = scale;
    markerScale.y = scale;
    markers.setMatrixAt(
      index,
      markerMatrix.compose(markerPosition, 0, markerScale),
    );
  });
  markers.zIndex = 2;
  return markers;
}

function showFatalError(error) {
  const element = document.querySelector('#error');
  if (!element) return;
  const message = error instanceof Error ? error.message : String(error);
  element.style.display = 'block';
  element.textContent =
    'Failed to start the WebGPU demo:\n\n' +
    message +
    '\n\nWebGPU needs a recent Chrome or Edge, and the page must be ' +
    'served over HTTP(S), for example with "npx serve .".';
  console.error(error);
}

try {
  await main();
} catch (error) {
  showFatalError(error);
}
