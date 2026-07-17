// Stress tests for both engines, built on instanced rendering: each
// engine gets a root group holding one InstancedMesh / InstancedShape2d
// per geometry, so N spinning objects cost two draw calls and two
// buffer uploads per frame. What is being stressed is the per-instance
// CPU work — recomposing N matrices every frame — and the GPU's
// appetite for instances, not draw-call overhead (crank the levels up
// if your machine shrugs at 8,000).

import {
  Object3d,
  InstancedMesh,
  BoxGeometry,
  SphereGeometry,
  LambertMaterial,
  Object2d,
  InstancedShape2d,
  RectGeometry,
  CircleGeometry,
  BasicMaterial2d,
  Vec3,
  Vec2,
  Mat4,
  Mat3,
} from '../src/index.js';

/** Object counts the stress button cycles through (0 = off). */
export const STRESS_LEVELS = [0, 500, 2000, 8000];

// Shared geometries — GpuResources caches vertex/index buffers per
// geometry instance, so every stress level reuses these four buffers.
// Kept low-poly on purpose.
const boxGeometry = new BoxGeometry(0.5, 0.5, 0.5);
const sphereGeometry = new SphereGeometry(0.3, 12, 8);
const rectGeometry = new RectGeometry(1, 1);
const circleGeometry = new CircleGeometry(0.5, 24);

/** HSL → [r, g, b], all channels in 0..1. */
function hsl(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Creates the stress test for a 3D and a 2D scene. Returns:
 *   setLevel(n) — populate both scenes with n stress objects (0 clears)
 *   update(dt, engine2D) — spin the active engine's stress objects
 *   count — the current level
 */
export function createStressTest(scene, scene2d) {
  const root3d = new Object3d();
  const root2d = new Object2d();
  scene.add(root3d);
  scene2d.add(root2d);

  // One entry per instanced mesh/shape: the mesh plus the plain
  // position/rotation/scale/speed state its instances animate from.
  const groups3d = [];
  const groups2d = [];
  let count = 0;

  const matrix4 = new Mat4(); // scratch, recomposed per instance
  const matrix3 = new Mat3();

  // Discards a root's instanced children, disposing them so their
  // uniform + instance buffers are released right away instead of
  // waiting for GC.
  function clear(root, groups) {
    for (const child of root.children) {
      child.parent = null;
      child.dispose();
    }
    root.children.length = 0;
    groups.length = 0;
  }

  function setLevel(n) {
    count = n;
    clear(root3d, groups3d);
    clear(root2d, groups2d);
    if (!n) return;

    // 3D: a ring-shaped cloud hovering over the ground plane, wider as
    // the count grows so density stays sane. Half boxes, half spheres —
    // one InstancedMesh each, colored per instance.
    const ringWidth = 2 + Math.sqrt(n) * 0.12;
    for (const [geometry, groupCount] of [
      [boxGeometry, Math.ceil(n / 2)],
      [sphereGeometry, Math.floor(n / 2)],
    ]) {
      if (!groupCount) continue;
      const mesh = new InstancedMesh(geometry, new LambertMaterial(), groupCount);
      const instances = [];
      for (let i = 0; i < groupCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.5 + Math.sqrt(Math.random()) * ringWidth;
        const s = 0.35 + Math.random() * 0.5;
        instances.push({
          position: new Vec3(
            Math.cos(angle) * radius,
            0.3 + Math.random() * 4,
            Math.sin(angle) * radius,
          ),
          rotation: new Vec3(Math.random() * Math.PI, Math.random() * Math.PI, 0),
          scale: new Vec3(s, s, s),
          speed: (Math.random() - 0.5) * 4,
        });
        mesh.setColorAt(i, hsl(Math.random(), 0.6, 0.55));
      }
      root3d.add(mesh);
      const group = { mesh, instances };
      groups3d.push(group);
      writeInstances3d(group);
    }

    // 2D: a confetti field of rects and circles. A third of the
    // instances are semi-transparent to exercise blending; each group
    // draws as one unit in zIndex order.
    const spread = 3 + Math.sqrt(n) * 0.12;
    for (const [geometry, groupCount] of [
      [rectGeometry, Math.ceil(n / 2)],
      [circleGeometry, Math.floor(n / 2)],
    ]) {
      if (!groupCount) continue;
      const shape = new InstancedShape2d(
        geometry,
        new BasicMaterial2d(),
        groupCount,
      );
      const instances = [];
      for (let i = 0; i < groupCount; i++) {
        instances.push({
          position: new Vec2(
            (Math.random() * 2 - 1) * spread,
            (Math.random() * 2 - 1) * spread,
          ),
          rotation: Math.random() * Math.PI,
          scale: new Vec2(
            0.15 + Math.random() * 0.5,
            0.15 + Math.random() * 0.5,
          ),
          speed: (Math.random() - 0.5) * 4,
        });
        const color = hsl(Math.random(), 0.65, 0.6);
        if (Math.random() < 0.35) color.push(0.55);
        shape.setColorAt(i, color);
      }
      root2d.add(shape);
      const group = { shape, instances };
      groups2d.push(group);
      writeInstances2d(group);
    }
  }

  function writeInstances3d({ mesh, instances }) {
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      matrix4.compose(inst.position, inst.rotation, inst.scale);
      mesh.setMatrixAt(i, matrix4);
    }
  }

  function writeInstances2d({ shape, instances }) {
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      matrix3.compose(inst.position, inst.rotation, inst.scale);
      shape.setMatrixAt(i, matrix3);
    }
  }

  // Only the active engine's objects are animated — the inactive scene
  // isn't rendered, so spinning it would be wasted work.
  function update(dt, engine2D) {
    if (engine2D) {
      root2d.rotation += dt * 0.05;
      for (const group of groups2d) {
        for (const inst of group.instances) inst.rotation += inst.speed * dt;
        writeInstances2d(group);
      }
    } else {
      root3d.rotation.y += dt * 0.05;
      for (const group of groups3d) {
        for (const inst of group.instances) {
          inst.rotation.y += inst.speed * dt;
          inst.rotation.x += inst.speed * 0.6 * dt;
        }
        writeInstances3d(group);
      }
    }
  }

  return {
    setLevel,
    update,
    get count() {
      return count;
    },
  };
}
