import {
  ArcOutlineGeometry,
  BasicMaterial2d,
  Camera2d,
  CircleGeometry,
  CircleOutlineGeometry,
  Geometry2d,
  InstancedShape2d,
  Mat3,
  PanZoomControls,
  Renderer2d,
  Scene2d,
  Shape2d,
} from '../src/index.js';
import { createRationalGeodesicSpecs } from './rationalGeodesics.js';

const DEMO = Object.freeze({
  denominatorLimit: 5,
  minimumPointCount: 3,
  arcSegments: 48,
  boundarySegments: 128,
  markerSegments: 16,
  markerRadius: 0.018,
  cameraSize: 1.25,
});
const UNIT_RADIUS = 1;
const LINE_TOPOLOGY = 'line-list';
const numberFormatter = new Intl.NumberFormat();

async function main() {
  const canvas = document.querySelector('#canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('The demo requires a canvas with id="canvas".');
  }

  const renderer = new Renderer2d(canvas, { autoResize: true });
  await renderer.init();

  let controls = null;
  let animationFrame = 0;
  try {
    const { scene, stats } = createDemoScene();
    const camera = new Camera2d(DEMO.cameraSize);
    controls = new PanZoomControls(camera, canvas);
    updateStats(stats);

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
      controls.dispose();
      scene.dispose();
      renderer.dispose();
    });
  } catch (error) {
    controls?.dispose();
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

  if (arcs.length > 0) {
    const arcLines = new Shape2d(createArcGeometry(arcs), geodesicMaterial);
    arcLines.zIndex = -1;
    scene.add(arcLines);
  }

  if (diameters.length > 0) {
    const diameterLines = new Shape2d(
      createDiameterGeometry(diameters),
      geodesicMaterial,
    );
    diameterLines.zIndex = -1;
    scene.add(diameterLines);
  }

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
  const markers = new InstancedShape2d(
    new CircleGeometry(markerRadius, DEMO.markerSegments),
    new BasicMaterial2d({ color: [0.2, 0.48, 1] }),
    points.length,
  );
  const markerMatrix = new Mat3();
  points.forEach(({ position: [x, y] }, index) => {
    markers.setMatrixAt(index, markerMatrix.makeTranslation(x, y));
  });
  markers.zIndex = 2;
  scene.add(markers);

  return { scene, stats };
}

function updateStats(stats) {
  const tripleSymbol = document.querySelector('#triple-symbol');
  const tripleCount = document.querySelector('#triple-count');
  const geodesicDetail = document.querySelector('#geodesic-detail');
  const geodesicFilter = document.querySelector('#geodesic-filter');

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
    )} rational points`;
  }
  if (geodesicFilter) {
    geodesicFilter.textContent =
      `${numberFormatter.format(stats.curvedGeodesicCount)} arcs \u00b7 ` +
      `${numberFormatter.format(stats.diameterGeodesicCount)} diameters \u00b7 ` +
      `coordinate denominator \u2264 ${numberFormatter.format(
        stats.denominatorLimit,
      )}`;
  }

  console.info('micro-gl rational Poincare geodesic demo', stats);
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

function createDiameterGeometry(diameters) {
  const vertices = diameters.flatMap(({ start, end }) => [
    ...start,
    0,
    0,
    ...end,
    1,
    1,
  ]);
  const indices = diameters.flatMap((_, index) => [index * 2, index * 2 + 1]);
  return new Geometry2d(vertices, indices);
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
