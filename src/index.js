// micro-gl — a tiny WebGPU engine, in two flavors that share one canvas:
//   src/3d/ — the perspective engine (Mat4, lights, depth buffer)
//   src/2d/ — the flat engine (Mat3, zIndex ordering, alpha blending)
// with src/math/ and src/core/ shared between them.
// Import everything from this single entry point:
//   import { Renderer, Scene, Mesh, ... } from './src/index.js';

// --- Shared ---------------------------------------------------------------
export { Vec3 } from './math/Vec3.js';
export { Mat4 } from './math/Mat4.js';
export { Vec2 } from './math/Vec2.js';
export { Mat3 } from './math/Mat3.js';
export { srgbToLinear, linearToSrgb } from './math/color.js';
export { initWebGpu } from './core/initWebGpu.js';
export { Texture } from './core/Texture.js';
export { PointerControls } from './core/PointerControls.js';

// --- 3D engine --------------------------------------------------------------
export { Object3d } from './3d/core/Object3d.js';
export { Raycaster } from './3d/core/Raycaster.js';
export { Scene } from './3d/core/Scene.js';
export { Mesh } from './3d/core/Mesh.js';
export { InstancedMesh } from './3d/core/InstancedMesh.js';
export { Renderer } from './3d/core/Renderer.js';

export { Camera } from './3d/cameras/Camera.js';
export { PerspectiveCamera } from './3d/cameras/PerspectiveCamera.js';
export { OrthographicCamera } from './3d/cameras/OrthographicCamera.js';
export { OrbitControls } from './3d/controls/OrbitControls.js';
export { DragControls } from './3d/controls/DragControls.js';

export { Geometry } from './3d/geometries/Geometry.js';
export { BoxGeometry } from './3d/geometries/BoxGeometry.js';
export { SphereGeometry } from './3d/geometries/SphereGeometry.js';
export { PlaneGeometry } from './3d/geometries/PlaneGeometry.js';

export { Material, MAX_POINT_LIGHTS } from './3d/materials/Material.js';
export { BasicMaterial } from './3d/materials/BasicMaterial.js';
export { LambertMaterial } from './3d/materials/LambertMaterial.js';
export { TextureMaterial } from './3d/materials/TextureMaterial.js';

export { DirectionalLight } from './3d/lights/DirectionalLight.js';
export { AmbientLight } from './3d/lights/AmbientLight.js';
export { PointLight } from './3d/lights/PointLight.js';

// --- 2D engine --------------------------------------------------------------
export { Object2d } from './2d/core/Object2d.js';
export { Scene2d } from './2d/core/Scene2d.js';
export { Shape2d } from './2d/core/Shape2d.js';
export { InstancedShape2d } from './2d/core/InstancedShape2d.js';
export { Renderer2d } from './2d/core/Renderer2d.js';

export { Camera2d } from './2d/cameras/Camera2d.js';
export { PanZoomControls } from './2d/controls/PanZoomControls.js';
export { DragControls2d } from './2d/controls/DragControls2d.js';

export { Geometry2d } from './2d/geometries/Geometry2d.js';
export { RectGeometry } from './2d/geometries/RectGeometry.js';
export { CircleGeometry } from './2d/geometries/CircleGeometry.js';

export { Material2d } from './2d/materials/Material2d.js';
export { BasicMaterial2d } from './2d/materials/BasicMaterial2d.js';
export { SpriteMaterial2d } from './2d/materials/SpriteMaterial2d.js';
