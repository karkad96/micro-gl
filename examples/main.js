import {
  BasicMaterial2d,
  Camera2d,
  CircleOutlineGeometry,
  GridHelper2d,
  PanZoomControls,
  Renderer2d,
  Scene2d,
  Shape2d,
} from '../src/index.js';

async function main() {
  const canvas = document.getElementById('canvas');
  const renderer = new Renderer2d(canvas, { autoResize: true });
  await renderer.init();

  const scene = new Scene2d();
  const grid = new GridHelper2d(10, 10, [0.3, 0.3, 0.35]);
  grid.zIndex = -1;
  scene.add(grid);

  const circle = new Shape2d(
    new CircleOutlineGeometry(2, 64),
    new BasicMaterial2d({
      color: [1, 0, 0],
      topology: 'line-list',
    }),
  );
  scene.add(circle);

  const camera = new Camera2d(5);
  new PanZoomControls(camera, canvas);

  function render() {
    renderer.render(scene, camera);
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
