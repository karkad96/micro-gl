// Stress tests for both engines. Each engine gets a root group filled
// with N spinning objects that all share a few geometries, so what is
// being stressed is the per-object work — matrix updates, uniform
// uploads and draw calls (plus the per-frame zIndex sort in 2D) — not
// vertex count.

import {
  Object3D,
  Mesh,
  BoxGeometry,
  SphereGeometry,
  LambertMaterial,
  Object2D,
  Shape2D,
  RectGeometry,
  CircleGeometry,
  BasicMaterial2D,
} from './src/index.js';

/** Object counts the stress button cycles through (0 = off). */
export const STRESS_LEVELS = [0, 500, 2000, 8000];

// Shared geometries — GPUResources caches vertex/index buffers per
// geometry instance, so thousands of objects reuse these four buffers.
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
  const root3d = new Object3D();
  const root2d = new Object2D();
  scene.add(root3d);
  scene2d.add(root2d);

  const spins3d = []; // { object, speed } per stress mesh
  const spins2d = [];
  let count = 0;

  // Discards a root's children, disposing them so their per-object
  // uniform buffers are released right away instead of waiting for GC.
  function clear(root, spins) {
    for (const child of root.children) {
      child.parent = null;
      child.dispose();
    }
    root.children.length = 0;
    spins.length = 0;
  }

  function setLevel(n) {
    count = n;
    clear(root3d, spins3d);
    clear(root2d, spins2d);

    // 3D: a ring-shaped cloud hovering over the ground plane, wider as
    // the count grows so density stays sane.
    const ringWidth = 2 + Math.sqrt(n) * 0.12;
    for (let i = 0; i < n; i++) {
      const mesh = new Mesh(
        i % 2 ? boxGeometry : sphereGeometry,
        new LambertMaterial({ color: hsl(Math.random(), 0.6, 0.55) }),
      );
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.sqrt(Math.random()) * ringWidth;
      mesh.position.set(
        Math.cos(angle) * radius,
        0.3 + Math.random() * 4,
        Math.sin(angle) * radius,
      );
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      const s = 0.35 + Math.random() * 0.5;
      mesh.scale.set(s, s, s);
      root3d.add(mesh);
      spins3d.push({ object: mesh, speed: (Math.random() - 0.5) * 4 });
    }

    // 2D: a confetti field of rects and circles. Random zIndex spread
    // keeps the painter's-algorithm sort honest, and a third of the
    // shapes are semi-transparent to exercise blending.
    const spread = 3 + Math.sqrt(n) * 0.12;
    for (let i = 0; i < n; i++) {
      const color = hsl(Math.random(), 0.65, 0.6);
      if (Math.random() < 0.35) color.push(0.55);
      const shape = new Shape2D(
        i % 2 ? rectGeometry : circleGeometry,
        new BasicMaterial2D({ color }),
      );
      shape.position.set(
        (Math.random() * 2 - 1) * spread,
        (Math.random() * 2 - 1) * spread,
      );
      shape.rotation = Math.random() * Math.PI;
      shape.scale.set(0.15 + Math.random() * 0.5, 0.15 + Math.random() * 0.5);
      shape.zIndex = Math.floor(Math.random() * 4);
      root2d.add(shape);
      spins2d.push({ object: shape, speed: (Math.random() - 0.5) * 4 });
    }
  }

  // Only the active engine's objects are animated — the inactive scene
  // isn't rendered, so spinning it would be wasted work.
  function update(dt, engine2D) {
    if (engine2D) {
      root2d.rotation += dt * 0.05;
      for (const s of spins2d) s.object.rotation += s.speed * dt;
    } else {
      root3d.rotation.y += dt * 0.05;
      for (const s of spins3d) {
        s.object.rotation.y += s.speed * dt;
        s.object.rotation.x += s.speed * 0.6 * dt;
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
