import { VERTEX_SIZE } from './Geometry.js';

function vertexIndex(vertices) {
  return vertices.length / VERTEX_SIZE;
}

function pushVertex(vertices, x, y, z, nx, ny, nz, u, v) {
  vertices.push(x, y, z, nx, ny, nz, u, v);
}

export function normalizeRadialSegments(radialSegments) {
  return Math.max(3, Math.floor(radialSegments));
}

export function appendTubeSide(
  vertices,
  indices,
  startX,
  endX,
  radius,
  radialSegments,
  startU,
  endU,
) {
  const base = vertexIndex(vertices);
  for (let i = 0; i <= radialSegments; i++) {
    const v = i / radialSegments;
    const angle = v * Math.PI * 2;
    const ny = Math.cos(angle);
    const nz = Math.sin(angle);
    const y = ny * radius;
    const z = nz * radius;
    pushVertex(vertices, startX, y, z, 0, ny, nz, startU, v);
    pushVertex(vertices, endX, y, z, 0, ny, nz, endU, v);
  }

  for (let i = 0; i < radialSegments; i++) {
    const start = base + i * 2;
    const next = start + 2;
    indices.push(start, next, next + 1, start, next + 1, start + 1);
  }
}

export function appendCap(
  vertices,
  indices,
  x,
  radius,
  radialSegments,
  normalX,
) {
  const center = vertexIndex(vertices);
  pushVertex(vertices, x, 0, 0, normalX, 0, 0, 0.5, 0.5);
  const ring = vertexIndex(vertices);

  for (let i = 0; i < radialSegments; i++) {
    const angle = (i / radialSegments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    pushVertex(
      vertices,
      x,
      c * radius,
      s * radius,
      normalX,
      0,
      0,
      0.5 + c * 0.5,
      0.5 + s * 0.5,
    );
  }

  for (let i = 0; i < radialSegments; i++) {
    const current = ring + i;
    const next = ring + ((i + 1) % radialSegments);
    if (normalX > 0) indices.push(center, current, next);
    else indices.push(center, next, current);
  }
}

export function appendShoulder(
  vertices,
  indices,
  x,
  shaftRadius,
  headRadius,
  radialSegments,
) {
  if (shaftRadius === headRadius) return;

  const innerRadius = Math.min(shaftRadius, headRadius);
  const outerRadius = Math.max(shaftRadius, headRadius);
  const normalX = headRadius > shaftRadius ? -1 : 1;
  const base = vertexIndex(vertices);

  for (let i = 0; i < radialSegments; i++) {
    const angle = (i / radialSegments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const radius of [innerRadius, outerRadius]) {
      pushVertex(
        vertices,
        x,
        c * radius,
        s * radius,
        normalX,
        0,
        0,
        0.5 + (c * radius) / (outerRadius * 2),
        0.5 + (s * radius) / (outerRadius * 2),
      );
    }
  }

  for (let i = 0; i < radialSegments; i++) {
    const inner = base + i * 2;
    const outer = inner + 1;
    const nextInner = base + ((i + 1) % radialSegments) * 2;
    const nextOuter = nextInner + 1;
    if (normalX > 0) {
      indices.push(
        inner,
        outer,
        nextOuter,
        inner,
        nextOuter,
        nextInner,
      );
    } else {
      indices.push(
        inner,
        nextOuter,
        outer,
        inner,
        nextInner,
        nextOuter,
      );
    }
  }
}

export function appendConeSide(
  vertices,
  indices,
  baseX,
  tipX,
  radius,
  radialSegments,
  baseU,
  tipU,
) {
  for (let i = 0; i < radialSegments; i++) {
    const angle = (i / radialSegments) * Math.PI * 2;
    const nextAngle = ((i + 1) / radialSegments) * Math.PI * 2;
    const y0 = Math.cos(angle) * radius;
    const z0 = Math.sin(angle) * radius;
    const y1 = Math.cos(nextAngle) * radius;
    const z1 = Math.sin(nextAngle) * radius;

    const edge1X = 0;
    const edge1Y = y1 - y0;
    const edge1Z = z1 - z0;
    const edge2X = tipX - baseX;
    const edge2Y = -y0;
    const edge2Z = -z0;
    let nx = edge1Y * edge2Z - edge1Z * edge2Y;
    let ny = edge1Z * edge2X - edge1X * edge2Z;
    let nz = edge1X * edge2Y - edge1Y * edge2X;
    const normalLength = Math.hypot(nx, ny, nz);
    nx /= normalLength;
    ny /= normalLength;
    nz /= normalLength;

    const base = vertexIndex(vertices);
    pushVertex(
      vertices,
      baseX,
      y0,
      z0,
      nx,
      ny,
      nz,
      baseU,
      i / radialSegments,
    );
    pushVertex(
      vertices,
      baseX,
      y1,
      z1,
      nx,
      ny,
      nz,
      baseU,
      (i + 1) / radialSegments,
    );
    pushVertex(
      vertices,
      tipX,
      0,
      0,
      nx,
      ny,
      nz,
      tipU,
      (i + 0.5) / radialSegments,
    );
    indices.push(base, base + 1, base + 2);
  }
}
