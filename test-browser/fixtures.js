import {
  AmbientLight,
  BasicMaterial,
  BasicMaterial2d,
  BoxGeometry,
  Camera2d,
  DirectionalLight,
  Geometry,
  Geometry2d,
  GridHelper,
  InstancedMesh,
  InstancedShape2d,
  LambertMaterial,
  Mat4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RectGeometry,
  Scene,
  Scene2d,
  Shape2d,
  SphereGeometry,
  SpriteMaterial2d,
  Texture,
  TextureMaterial,
} from '../src/index.js';

/** Creates an image-backed texture without relying on external assets. */
export function createCheckerTexture() {
  const source = document.createElement('canvas');
  source.width = 8;
  source.height = 8;
  const context = source.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      context.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#4169e1';
      context.fillRect(x * 2, y * 2, 2, 2);
    }
  }
  // Mipmaps exercise the library's additional internal WGSL/pipeline.
  return new Texture(source, { flipY: true, mipmaps: true });
}

/** A scene that forces every stock 3D material vertex-stage combination. */
export function create3dPipelineFixture(texture) {
  const scene = new Scene();
  scene.background = [0.01, 0.015, 0.025, 1];
  const geometries = new Set();
  const objects = [];

  const box = rememberGeometry(geometries, new BoxGeometry(0.8, 0.8, 0.8));
  const sphere = rememberGeometry(
    geometries,
    new SphereGeometry(0.5, 10, 6),
  );
  const stripGeometry = rememberGeometry(
    geometries,
    create3dTopologyGeometry(),
  );

  scene.add(new AmbientLight([0.3, 0.35, 0.45], 0.35));
  const sun = new DirectionalLight([1, 0.95, 0.85], 1);
  sun.direction.set(-1, -2, -1);
  sun.castShadow = true;
  sun.shadow.mapSize = 128;
  sun.shadow.camera.size = 6;
  scene.add(sun);
  for (let i = 0; i < 4; i++) {
    const light = new PointLight([0.3 + i * 0.15, 0.5, 1], 0.8);
    light.position.set((i - 1.5) * 2, 2, 2);
    scene.add(light);
  }

  let placement = 0;
  const add = (object) => {
    const column = placement % 6;
    const row = Math.floor(placement / 6);
    object.position.set((column - 2.5) * 1.6, (1 - row) * 1.8, 0);
    placement++;
    objects.push(object);
    scene.add(object);
  };

  const materialCases = [
    {
      geometry: box,
      create: (transparent) =>
        new BasicMaterial({
          color: [0.9, 0.25, 0.15, transparent ? 0.5 : 1],
          transparent,
        }),
    },
    {
      geometry: sphere,
      create: (transparent) =>
        new LambertMaterial({
          color: [0.2, 0.75, 0.4, transparent ? 0.5 : 1],
          transparent,
        }),
    },
    {
      geometry: box,
      create: (transparent) =>
        new TextureMaterial({
          map: texture,
          color: [1, 1, 1, transparent ? 0.5 : 1],
          transparent,
        }),
    },
  ];

  for (const { geometry, create } of materialCases) {
    const opaqueMesh = new Mesh(geometry, create(false));
    opaqueMesh.castShadow = true;
    opaqueMesh.receiveShadow = true;
    add(opaqueMesh);
    add(new Mesh(geometry, create(true)));

    const opaqueInstances = new InstancedMesh(geometry, create(false), 2);
    opaqueInstances.castShadow = true;
    opaqueInstances.receiveShadow = true;
    opaqueInstances.setColorAt(0, [1, 0.8, 0.6]);
    opaqueInstances.setColorAt(1, [0.6, 0.8, 1]);
    add(opaqueInstances);

    const transparentInstances = new InstancedMesh(
      geometry,
      create(true),
      2,
    );
    transparentInstances.setColorAt(0, [1, 0.7, 0.8]);
    transparentInstances.setColorAt(1, [0.7, 1, 0.8]);
    add(transparentInstances);
  }

  const grid = new GridHelper(1, 2, [0.7, 0.75, 0.9]);
  geometries.add(grid.geometry);
  add(grid);
  const stripMesh = new Mesh(
    stripGeometry,
    new BasicMaterial({
      topology: 'triangle-strip',
      cullMode: 'front',
      frontFace: 'cw',
    }),
  );
  stripMesh.castShadow = true;
  add(stripMesh);
  add(
    new Mesh(
      stripGeometry,
      new BasicMaterial({ topology: 'line-strip' }),
    ),
  );
  add(
    new Mesh(
      stripGeometry,
      new BasicMaterial({ topology: 'point-list' }),
    ),
  );

  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 16);
  camera.lookAt(0, 0, 0);

  return {
    scene,
    camera,
    geometries,
    objects,
    expectedDrawCount: 22,
    expectedPipelineCount: 16,
    expectedShaderModuleCount: 6,
    expectedShadowDrawCount: 10,
    expectedShadowPipelineCount: 3,
  };
}

/** A scene that forces regular/instanced 2D shaders and every topology. */
export function create2dPipelineFixture(texture) {
  const scene = new Scene2d();
  scene.background = [0.015, 0.02, 0.03, 1];
  const geometries = new Set();
  const objects = [];
  const rect = rememberGeometry(geometries, new RectGeometry(0.9, 0.9));
  const topologyGeometry = rememberGeometry(
    geometries,
    create2dTopologyGeometry(),
  );

  let placement = 0;
  const add = (object) => {
    const column = placement % 5;
    const row = Math.floor(placement / 5);
    object.position.set((column - 2) * 1.6, (0.5 - row) * 2);
    placement++;
    objects.push(object);
    scene.add(object);
  };

  const materialCases = [
    () => new BasicMaterial2d({ color: [0.9, 0.3, 0.2, 0.7] }),
    () => new SpriteMaterial2d({ map: texture, color: [1, 1, 1, 0.8] }),
  ];
  for (const createMaterial of materialCases) {
    add(new Shape2d(rect, createMaterial()));
    const instances = new InstancedShape2d(rect, createMaterial(), 2);
    instances.setColorAt(0, [1, 0.75, 0.5, 0.8]);
    instances.setColorAt(1, [0.5, 0.75, 1, 0.8]);
    add(instances);
  }

  for (const topology of [
    'triangle-strip',
    'line-strip',
    'line-list',
    'point-list',
  ]) {
    add(
      new Shape2d(
        topologyGeometry,
        new BasicMaterial2d({
          topology,
          cullMode: topology === 'triangle-strip' ? 'front' : 'none',
          frontFace: topology === 'triangle-strip' ? 'cw' : 'ccw',
        }),
      ),
    );
  }

  return {
    scene,
    camera: new Camera2d(5, 1),
    geometries,
    objects,
    expectedDrawCount: 10,
    expectedPipelineCount: 8,
    expectedShaderModuleCount: 4,
  };
}

export function create3dPixelFixture() {
  const geometry = new BoxGeometry(1.8, 1.8, 1.8);
  const scene = new Scene();
  scene.background = [0, 0, 0, 1];
  scene.add(
    new Mesh(geometry, new BasicMaterial({ color: [1, 0, 0, 1] })),
  );
  const camera = new PerspectiveCamera(55, 1, 0.1, 10);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  return {
    scene,
    camera,
    geometries: new Set([geometry]),
    objects: scene.children,
  };
}

/** A top-down scene with stable lit and shadowed ground sample points. */
export function create3dShadowPixelFixture() {
  const groundGeometry = new PlaneGeometry(6, 6);
  const casterGeometry = new BoxGeometry(0.6, 2, 0.6);
  const scene = new Scene();
  scene.background = [0, 0, 0, 1];

  const ground = new Mesh(
    groundGeometry,
    new LambertMaterial({ color: [1, 1, 1, 1] }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const caster = new Mesh(
    casterGeometry,
    new LambertMaterial({ color: [0.75, 0.8, 0.9, 1] }),
  );
  caster.position.set(0, 1, 0);
  caster.castShadow = true;
  scene.add(caster);

  const instances = new InstancedMesh(
    casterGeometry,
    new LambertMaterial({ color: [0.7, 0.8, 1, 1] }),
    2,
  );
  instances.castShadow = true;
  const instanceMatrix = new Mat4();
  instances.setMatrixAt(0, instanceMatrix.makeTranslation(-1.5, 1, -1.3));
  instances.setMatrixAt(1, instanceMatrix.makeTranslation(-1.5, 1, 1.3));
  scene.add(instances);

  scene.add(new AmbientLight([1, 1, 1], 0.12));
  const sun = new DirectionalLight([1, 1, 1], 1);
  sun.direction.set(1, -2, 0);
  sun.castShadow = true;
  sun.shadow.mapSize = 256;
  sun.shadow.bias = 0.001;
  sun.shadow.normalBias = 0.01;
  sun.shadow.camera.size = 3.2;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 20;
  sun.shadow.camera.lookAt(0, 0, 0);
  scene.add(sun);

  const camera = new OrthographicCamera(3, 1, 0.1, 20);
  camera.position.set(0, 8, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);

  return {
    scene,
    camera,
    geometries: new Set([groundGeometry, casterGeometry]),
    objects: [ground, caster, instances],
    expectedShadowDrawCount: 3,
    shadowSample: [0.64, 0.5],
    litSample: [0.25, 0.5],
  };
}

export function create2dPixelFixture() {
  const geometry = new RectGeometry(3, 3);
  const scene = new Scene2d();
  scene.background = [0, 0, 0, 1];
  scene.add(
    new Shape2d(
      geometry,
      new BasicMaterial2d({ color: [0, 1, 0, 1] }),
    ),
  );
  return {
    scene,
    camera: new Camera2d(2, 1),
    geometries: new Set([geometry]),
    objects: scene.children,
  };
}

export function disposeFixture(fixture) {
  fixture.scene.dispose();
  for (const geometry of fixture.geometries) geometry.dispose();
}

function rememberGeometry(geometries, geometry) {
  geometries.add(geometry);
  return geometry;
}

function create3dTopologyGeometry() {
  return new Geometry(
    [
      -0.5, -0.5, 0, 0, 0, 1, 0, 0,
      0.5, -0.5, 0, 0, 0, 1, 1, 0,
      -0.5, 0.5, 0, 0, 0, 1, 0, 1,
      0.5, 0.5, 0, 0, 0, 1, 1, 1,
    ],
    [0, 1, 2, 3],
  );
}

function create2dTopologyGeometry() {
  return new Geometry2d(
    [
      -0.5, -0.5, 0, 0,
      0.5, -0.5, 1, 0,
      -0.5, 0.5, 0, 1,
      0.5, 0.5, 1, 1,
    ],
    [0, 1, 2, 3],
  );
}
