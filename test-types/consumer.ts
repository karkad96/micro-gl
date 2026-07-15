// Typechecks the generated declarations the way a strict TypeScript
// consumer would. `tsc -p tsconfig.types.json` succeeds even when a JSDoc
// type name fails to resolve (checkJs is off), so this file is what
// actually proves the published types work: it imports the public entry
// point, exercises the main APIs, and is compiled with strict settings
// and no skipLibCheck. Run it with `npm run check:types`.
import {
  BasicMaterial2d,
  BoxGeometry,
  Camera2d,
  DragControls,
  InstancedMesh,
  LambertMaterial,
  Mat4,
  Mesh,
  OrbitControls,
  PerspectiveCamera,
  Raycaster,
  RectGeometry,
  Renderer,
  Renderer2d,
  Scene,
  Scene2d,
  Shape2d,
  Texture,
  TextureMaterial,
  initWebGpu,
} from '../types/index.js';

const canvas = {} as HTMLCanvasElement;

async function main(): Promise<void> {
  const renderer = new Renderer(canvas, { autoResize: true, antialias: false });
  await renderer.init();

  const scene = new Scene();
  scene.background = [0.04, 0.05, 0.08, 1];
  const mesh = new Mesh(
    new BoxGeometry(1, 2, 3),
    new LambertMaterial({ color: [1, 0.35, 0.1], topology: 'line-list' }),
  );
  mesh.castShadow = true;
  scene.add(mesh);

  const instanced = new InstancedMesh(new BoxGeometry(), mesh.material, 8);
  instanced.setMatrixAt(0, new Mat4().makeTranslation(1, 2, 3));
  instanced.setColorAt(0, [1, 0, 0, 0.5]);
  scene.add(instanced);

  const camera = new PerspectiveCamera(60);
  camera.position.set(3, 2, 4);
  camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.update();
  renderer.render(scene, camera);

  const texture = await Texture.load('/x.png', { flipY: true });
  const textured: Mesh = new Mesh(
    new BoxGeometry(),
    new TextureMaterial({ map: texture }),
  );
  const hits = new Raycaster()
    .setFromCamera(0, 0, camera)
    .intersectObjects([textured]);
  void hits[0]?.distance;
  const drag = new DragControls([textured], camera, canvas);
  drag.dispose();

  const renderer2d = new Renderer2d(canvas);
  await renderer2d.init(renderer);
  const scene2d = new Scene2d();
  const shape: Shape2d = new Shape2d(
    new RectGeometry(2, 1),
    new BasicMaterial2d({ color: [0.2, 0.7, 1] }),
  );
  shape.zIndex = 2;
  scene2d.add(shape);
  renderer2d.render(scene2d, new Camera2d(4));

  const gpu = await initWebGpu(canvas);
  const device: GPUDevice = gpu.device;
  void device;
  renderer2d.dispose();
  renderer.dispose();
}

void main;
