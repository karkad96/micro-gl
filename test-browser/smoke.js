import {
  BasicMaterial,
  BasicMaterial2d,
  Renderer,
  Renderer2d,
  SpriteMaterial2d,
  TextureMaterial,
  LambertMaterial,
  initWebGpu,
} from '../src/index.js';
import { Pipelines2d } from '../src/2d/core/Pipelines2d.js';
import {
  create2dPipelineFixture,
  create2dGrayClearFixture,
  create2dMsaaResolveFixture,
  create2dOpaqueGrayFixture,
  create2dPixelFixture,
  create2dTransparencyFixture,
  create3dDirectionalLightDirectionFixture,
  create3dFrustumCullingFixture,
  create3dMsaaResolveFixture,
  create3dPipelineFixture,
  create3dPixelFixture,
  create3dShadowPixelFixture,
  create3dTransparencyFixture,
  createCheckerTexture,
  disposeFixture,
} from './fixtures.js';

const resultElement = document.getElementById('result');
const canvas = document.getElementById('gpu-canvas');

globalThis.__microGlWebGpuSmoke = runSmokeTest()
  .then((result) => ({ status: 'passed', ...result }))
  .catch((error) => {
    if (error instanceof WebGpuUnavailableError) {
      return { status: 'skipped', reason: error.message };
    }
    return {
      status: 'failed',
      error: error.message,
      stack: error.stack,
    };
  });

globalThis.__microGlWebGpuSmoke.then((result) => {
  resultElement.textContent = JSON.stringify(result, null, 2);
  resultElement.dataset.status = result.status;
});

async function runSmokeTest() {
  if (!navigator.gpu) {
    throw new WebGpuUnavailableError('navigator.gpu is unavailable');
  }

  let gpu = null;
  let texture = null;
  let fixture3d = null;
  let fixture2d = null;
  let pixelFixture3d = null;
  let directionalLightFixture3d = null;
  let frustumFixture3d = null;
  let shadowPixelFixture3d = null;
  let pixelFixture2d = null;
  let transparencyFixture3d = null;
  let transparencyFixture2d = null;
  let msaaResolveFixture3d = null;
  let msaaResolveFixture2d = null;
  let opaqueGrayFixture2d = null;
  let grayClearFixture2d = null;
  const renderers = [];
  const checks = [];
  const warnings = [];
  const uncapturedErrors = [];

  try {
    try {
      gpu = await initWebGpu(canvas);
    } catch (error) {
      if (/No suitable GPU adapter|WebGPU is not supported/.test(error.message)) {
        throw new WebGpuUnavailableError(error.message);
      }
      throw error;
    }

    const { device } = gpu;
    device.addEventListener('uncapturederror', (event) => {
      event.preventDefault();
      uncapturedErrors.push(event.error?.message || String(event.error));
    });

    texture = createCheckerTexture();
    fixture3d = create3dPipelineFixture(texture);
    fixture2d = create2dPipelineFixture(texture);
    pixelFixture3d = create3dPixelFixture();
    directionalLightFixture3d = create3dDirectionalLightDirectionFixture();
    frustumFixture3d = create3dFrustumCullingFixture();
    shadowPixelFixture3d = create3dShadowPixelFixture();
    pixelFixture2d = create2dPixelFixture();
    transparencyFixture3d = create3dTransparencyFixture();
    transparencyFixture2d = create2dTransparencyFixture();
    msaaResolveFixture3d = create3dMsaaResolveFixture();
    msaaResolveFixture2d = create2dMsaaResolveFixture();
    opaqueGrayFixture2d = create2dOpaqueGrayFixture();
    grayClearFixture2d = create2dGrayClearFixture();

    const msaa3d = new Renderer(canvas, { antialias: true });
    const msaa2d = new Renderer2d(canvas, { antialias: true });
    const singleSample3d = new Renderer(canvas, { antialias: false });
    const singleSample2d = new Renderer2d(canvas, { antialias: false });
    renderers.push(msaa3d, msaa2d, singleSample3d, singleSample2d);

    await gpuPhase(device, 'renderer initialization', async () => {
      // COPY_SRC is test-only and enables deterministic GPU-buffer readback.
      gpu.context.configure({
        device,
        format: gpu.format,
        viewFormats: [gpu.colorFormat],
        alphaMode: 'opaque',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      // The raw setup lets error scopes cover layout/buffer creation while
      // retaining explicit ownership of the context/device in this harness.
      await msaa3d.init(gpu);
      await msaa2d.init(msaa3d);
      await singleSample3d.init(msaa3d);
      await singleSample2d.init(msaa3d);
    });
    pass(checks, 'initialized shared 4x and 1x 2D/3D renderers');

    warnings.push(
      ...(await gpuPhase(device, 'stock WGSL compilation', () =>
        validateStockShaderModules(device, texture),
      )),
    );
    pass(checks, 'compiled all 10 stock regular/instanced WGSL modules');

    await gpuPhase(device, 'custom 2D frame-uniform fragment pipeline', () => {
      const pipelines = new Pipelines2d(device, gpu.colorFormat);
      const material = new FrameUniformFragmentMaterial2d();
      pipelines.pipelineFor(material);
      pipelines.pipelineFor(material, true);
    });
    pass(checks, 'compiled custom 2D fragments that read frame uniforms');

    const pipelineReports = {};
    await gpuPhase(device, '4x MSAA pipeline rendering', async () => {
      pipelineReports.msaa3d = renderFixture(
        msaa3d,
        fixture3d,
        '4x 3D',
        checks,
      );
      pipelineReports.msaa2d = renderFixture(
        msaa2d,
        fixture2d,
        '4x 2D',
        checks,
      );
    });

    await gpuPhase(device, 'single-sample pipeline rendering', async () => {
      pipelineReports.singleSample3d = renderFixture(
        singleSample3d,
        fixture3d,
        '1x 3D',
        checks,
      );
      pipelineReports.singleSample2d = renderFixture(
        singleSample2d,
        fixture2d,
        '1x 2D',
        checks,
      );
    });

    await gpuPhase(device, 'shared-canvas attachment resizing', async () => {
      singleSample3d.setSize(96, 80);
      singleSample3d.render(fixture3d.scene, fixture3d.camera);
      msaa3d.render(fixture3d.scene, fixture3d.camera);
      assert(
        msaa3d._targetWidth === canvas.width &&
          msaa3d._targetHeight === canvas.height,
        '4x renderer did not refresh attachments after a shared resize',
      );
      msaa3d.setSize(128, 128);
    });
    pass(checks, 'refreshed stale shared-canvas attachments');

    let frustumCullingReport;
    await gpuPhase(device, 'frustum-culling rendering', async () => {
      singleSample3d.setSize(64, 128);
      const tall = renderFrustumCullingFixture(
        singleSample3d,
        frustumFixture3d,
        false,
        frustumFixture3d.expectedTallDrawCount,
      );

      singleSample3d.setSize(128, 64);
      const wide = renderFrustumCullingFixture(
        singleSample3d,
        frustumFixture3d,
        true,
        frustumFixture3d.expectedWideDrawCount,
      );
      frustumCullingReport = { tall, wide };

      // Keep later pixel fixtures square and make the shared renderers refresh
      // their attachments through their normal render path.
      singleSample3d.setSize(128, 128);
    });
    pass(
      checks,
      'culled resized-camera meshes and conservative instanced batches',
    );

    let redPixel;
    let greenPixel;
    const directionalLightPixels = {};
    let litGroundPixel;
    let shadowedGroundPixel;
    await gpuPhase(device, 'known-pixel rendering', async () => {
      msaa3d.render(pixelFixture3d.scene, pixelFixture3d.camera);
      redPixel = await readCenterPixel(
        device,
        gpu.context,
        gpu.format,
        canvas.width,
        canvas.height,
      );
      assertDominantColor(redPixel, 0, '3D red center pixel');

      msaa2d.render(pixelFixture2d.scene, pixelFixture2d.camera);
      greenPixel = await readCenterPixel(
        device,
        gpu.context,
        gpu.format,
        canvas.width,
        canvas.height,
      );
      assertDominantColor(greenPixel, 1, '2D green center pixel');
    });
    pass(checks, 'read back known red 3D and green 2D pixels');

    await gpuPhase(device, 'invalid directional-light rendering', async () => {
      for (const [label, direction, expectedGray] of [
        ['zero', [0, 0, 0], 255],
        ['NaN', [1, NaN, 0], 255],
        ['infinity', [1, -1, Infinity], 255],
        [
          'huge finite',
          [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE],
          200,
        ],
      ]) {
        directionalLightFixture3d.light.direction.set(...direction);
        singleSample3d.render(
          directionalLightFixture3d.scene,
          directionalLightFixture3d.camera,
        );
        const pixel = await readCenterPixel(
          device,
          gpu.context,
          gpu.format,
          canvas.width,
          canvas.height,
        );
        assertGrayPixel(pixel, expectedGray, `${label} light direction`);
        directionalLightPixels[label] = pixel;
      }
    });
    pass(
      checks,
      'normalized huge directional lights and safely handled invalid ones',
    );

    const transparencyPixels = {};
    const msaaResolvePixels = {};
    let opaqueGrayPixel;
    let grayClearPixel;
    await gpuPhase(device, 'linear color compositing', async () => {
      for (const [key, label, renderer, fixture] of [
        [
          'singleSample3d',
          '1x 3D transparency',
          singleSample3d,
          transparencyFixture3d,
        ],
        [
          'singleSample2d',
          '1x 2D transparency',
          singleSample2d,
          transparencyFixture2d,
        ],
        ['msaa3d', '4x 3D transparency', msaa3d, transparencyFixture3d],
        ['msaa2d', '4x 2D transparency', msaa2d, transparencyFixture2d],
      ]) {
        renderer.render(fixture.scene, fixture.camera);
        const pixel = await readCenterPixel(
          device,
          gpu.context,
          gpu.format,
          canvas.width,
          canvas.height,
        );
        assertGrayPixel(pixel, 188, label);
        transparencyPixels[key] = pixel;
      }

      for (const [key, label, renderer, fixture] of [
        ['msaa3d', '4x 3D resolve', msaa3d, msaaResolveFixture3d],
        ['msaa2d', '4x 2D resolve', msaa2d, msaaResolveFixture2d],
      ]) {
        renderer.render(fixture.scene, fixture.camera);
        const pixel = await readCenterPixel(
          device,
          gpu.context,
          gpu.format,
          canvas.width,
          canvas.height,
        );
        assertGrayPixel(pixel, 188, label);
        msaaResolvePixels[key] = pixel;
      }

      singleSample2d.render(
        opaqueGrayFixture2d.scene,
        opaqueGrayFixture2d.camera,
      );
      opaqueGrayPixel = await readCenterPixel(
        device,
        gpu.context,
        gpu.format,
        canvas.width,
        canvas.height,
      );
      assertGrayPixel(opaqueGrayPixel, 128, 'authored sRGB gray');

      singleSample2d.render(grayClearFixture2d.scene, grayClearFixture2d.camera);
      grayClearPixel = await readCenterPixel(
        device,
        gpu.context,
        gpu.format,
        canvas.width,
        canvas.height,
      );
      assertGrayPixel(grayClearPixel, 128, 'sRGB background clear');
    });
    pass(checks, 'blended 1x/4x 2D/3D transparency in linear space');
    pass(checks, 'resolved 4x 2D/3D multisampling in linear space');
    pass(checks, 'round-tripped authored and clear sRGB gray');

    await gpuPhase(device, 'directional shadow pixel rendering', async () => {
      msaa3d.render(
        shadowPixelFixture3d.scene,
        shadowPixelFixture3d.camera,
      );
      shadowedGroundPixel = await readPixel(
        device,
        gpu.context,
        gpu.format,
        canvas.width,
        canvas.height,
        ...shadowPixelFixture3d.shadowSample,
      );

      // Render again before the second asynchronous readback so the canvas's
      // current swap texture is guaranteed to contain this fixture.
      msaa3d.render(
        shadowPixelFixture3d.scene,
        shadowPixelFixture3d.camera,
      );
      litGroundPixel = await readPixel(
        device,
        gpu.context,
        gpu.format,
        canvas.width,
        canvas.height,
        ...shadowPixelFixture3d.litSample,
      );

      assert(
        msaa3d.shadowDrawCount ===
          shadowPixelFixture3d.expectedShadowDrawCount,
        `directional shadow fixture: expected shadowDrawCount ` +
          `${shadowPixelFixture3d.expectedShadowDrawCount}, received ` +
          `${msaa3d.shadowDrawCount}`,
      );
      assertShadowContrast(shadowedGroundPixel, litGroundPixel);
    });
    pass(
      checks,
      'rendered regular/instanced directional casters and read back their shadow',
    );

    await gpuPhase(device, 'shared renderer lifetime', async () => {
      msaa3d.dispose();
      msaa2d.render(pixelFixture2d.scene, pixelFixture2d.camera);
      assert(msaa2d.device === device, 'shared device was lost with its owner');
    });
    pass(checks, 'rendered after disposing the first shared renderer');

    await device.queue.onSubmittedWorkDone();
    await Promise.resolve();
    assert(
      uncapturedErrors.length === 0,
      `uncaptured GPU errors:\n${uncapturedErrors.join('\n')}`,
    );
    pass(checks, 'observed zero uncaptured GPU errors');

    return {
      browser: navigator.userAgent,
      adapter: adapterDescription(device),
      checks,
      warnings,
      pipelineReports,
      frustumCulling: frustumCullingReport,
      pixels: {
        red3d: redPixel,
        green2d: greenPixel,
        directionalLights3d: directionalLightPixels,
        transparency: transparencyPixels,
        msaaResolve: msaaResolvePixels,
        opaqueGray2d: opaqueGrayPixel,
        grayClear2d: grayClearPixel,
        litGround3d: litGroundPixel,
        shadowedGround3d: shadowedGroundPixel,
      },
    };
  } finally {
    for (const renderer of renderers) renderer.dispose();
    if (fixture3d) disposeFixture(fixture3d);
    if (fixture2d) disposeFixture(fixture2d);
    if (pixelFixture3d) disposeFixture(pixelFixture3d);
    if (directionalLightFixture3d) {
      disposeFixture(directionalLightFixture3d);
    }
    if (frustumFixture3d) disposeFixture(frustumFixture3d);
    if (shadowPixelFixture3d) disposeFixture(shadowPixelFixture3d);
    if (pixelFixture2d) disposeFixture(pixelFixture2d);
    if (transparencyFixture3d) disposeFixture(transparencyFixture3d);
    if (transparencyFixture2d) disposeFixture(transparencyFixture2d);
    if (msaaResolveFixture3d) disposeFixture(msaaResolveFixture3d);
    if (msaaResolveFixture2d) disposeFixture(msaaResolveFixture2d);
    if (opaqueGrayFixture2d) disposeFixture(opaqueGrayFixture2d);
    if (grayClearFixture2d) disposeFixture(grayClearFixture2d);
    if (texture) texture.dispose();
    if (gpu) {
      gpu.context.unconfigure();
      gpu.device.destroy();
    }
  }
}

function renderFrustumCullingFixture(
  renderer,
  fixture,
  expectAspectSensitive,
  expectedDrawCount,
) {
  renderer.render(fixture.scene, fixture.camera);
  const expectedAspect = renderer.canvas.width / renderer.canvas.height;
  assert(
    Math.abs(fixture.camera.aspect - expectedAspect) < 1e-12,
    `frustum fixture: expected camera aspect ${expectedAspect}, received ` +
      `${fixture.camera.aspect}`,
  );
  assert(
    renderer.drawCount === expectedDrawCount,
    `frustum fixture at aspect ${expectedAspect}: expected drawCount ` +
      `${expectedDrawCount}, received ${renderer.drawCount}`,
  );

  const colorMeshes = [
    ...renderer._opaqueList,
    ...renderer._transparentList,
  ];
  assert(
    colorMeshes.includes(fixture.aspectSensitive) === expectAspectSensitive,
    `frustum fixture at aspect ${expectedAspect}: side mesh visibility was ` +
      `${colorMeshes.includes(fixture.aspectSensitive)}`,
  );
  assert(
    colorMeshes.includes(fixture.forced),
    'frustum fixture: frustumCulled=false mesh was removed',
  );
  assert(
    !colorMeshes.includes(fixture.allOutsideBatch),
    'frustum fixture: all-outside instanced batch was retained',
  );
  assert(
    colorMeshes.includes(fixture.mixedBatch),
    'frustum fixture: mixed instanced batch was removed',
  );
  assert(
    !colorMeshes.includes(fixture.shadowCaster) &&
      renderer._shadowMeshList.includes(fixture.shadowCaster),
    'frustum fixture: off-camera light-visible caster was not shadow-only',
  );
  assert(
    renderer.shadowDrawCount === fixture.expectedShadowDrawCount,
    `frustum fixture: expected shadowDrawCount ` +
      `${fixture.expectedShadowDrawCount}, received ` +
      `${renderer.shadowDrawCount}`,
  );

  return {
    aspect: fixture.camera.aspect,
    drawCount: renderer.drawCount,
    shadowDrawCount: renderer.shadowDrawCount,
    aspectSensitiveVisible: colorMeshes.includes(fixture.aspectSensitive),
    forcedVisible: colorMeshes.includes(fixture.forced),
    allOutsideBatchVisible: colorMeshes.includes(fixture.allOutsideBatch),
    mixedBatchVisible: colorMeshes.includes(fixture.mixedBatch),
    shadowCasterColorVisible: colorMeshes.includes(fixture.shadowCaster),
    shadowCasterDepthVisible: renderer._shadowMeshList.includes(
      fixture.shadowCaster,
    ),
  };
}

function renderFixture(renderer, fixture, label, checks) {
  renderer.render(fixture.scene, fixture.camera);
  assert(
    renderer.drawCount === fixture.expectedDrawCount,
    `${label}: expected drawCount ${fixture.expectedDrawCount}, ` +
      `received ${renderer.drawCount}`,
  );

  const pipelines = renderer._resources.pipelines;
  const pipelineCount = countPipelineVariants(pipelines._cache);
  assert(
    pipelineCount === fixture.expectedPipelineCount,
    `${label}: expected ${fixture.expectedPipelineCount} pipelines, ` +
      `received ${pipelineCount}`,
  );
  assert(
    pipelines._modules.size === fixture.expectedShaderModuleCount,
    `${label}: expected ${fixture.expectedShaderModuleCount} shader modules, ` +
      `received ${pipelines._modules.size}`,
  );
  let shadowPipelineCount = 0;
  if (fixture.expectedShadowDrawCount !== undefined) {
    assert(
      renderer.shadowDrawCount === fixture.expectedShadowDrawCount,
      `${label}: expected shadowDrawCount ` +
        `${fixture.expectedShadowDrawCount}, received ` +
        `${renderer.shadowDrawCount}`,
    );
    shadowPipelineCount = renderer._shadowMap._pipelines._cache.size;
    assert(
      shadowPipelineCount === fixture.expectedShadowPipelineCount,
      `${label}: expected ${fixture.expectedShadowPipelineCount} shadow ` +
        `pipelines, received ${shadowPipelineCount}`,
    );
  }
  pass(
    checks,
    `${label} rendered ${renderer.drawCount} objects through ` +
      `${pipelineCount} pipelines`,
  );
  return {
    drawCount: renderer.drawCount,
    pipelineCount,
    shaderModuleCount: pipelines._modules.size,
    shadowDrawCount: renderer.shadowDrawCount || 0,
    shadowPipelineCount,
  };
}

async function validateStockShaderModules(device, texture) {
  const materials = [
    ['BasicMaterial', new BasicMaterial()],
    ['LambertMaterial', new LambertMaterial()],
    ['TextureMaterial', new TextureMaterial({ map: texture })],
    ['BasicMaterial2d', new BasicMaterial2d()],
    ['SpriteMaterial2d', new SpriteMaterial2d({ map: texture })],
  ];
  const warnings = [];
  for (const [label, material] of materials) {
    for (const [variant, code] of [
      ['regular', material.shaderCode],
      ['instanced', material.instancedShaderCode],
    ]) {
      const shaderLabel = `${label} (${variant})`;
      const module = device.createShaderModule({ label: shaderLabel, code });
      const info = await module.getCompilationInfo();
      const errors = [];
      for (const message of info.messages) {
        const formatted = formatCompilationMessage(shaderLabel, message);
        if (message.type === 'error') errors.push(formatted);
        if (message.type === 'warning') warnings.push(formatted);
      }
      assert(errors.length === 0, errors.join('\n'));
    }
  }
  return warnings;
}

const FRAME_UNIFORM_FRAGMENT_SHADER_2D = /* wgsl */ `
@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let cameraScale = uFrame.viewProjection[0][0];
  return vec4f(vec3f(cameraScale), objectColor(input).a);
}
`;

class FrameUniformFragmentMaterial2d extends BasicMaterial2d {
  get fragmentShader() {
    return FRAME_UNIFORM_FRAGMENT_SHADER_2D;
  }
}

async function gpuPhase(device, label, operation) {
  const filters = ['internal', 'out-of-memory', 'validation'];
  for (const filter of filters) device.pushErrorScope(filter);

  let result;
  let operationError = null;
  try {
    result = await operation();
    await device.queue.onSubmittedWorkDone();
  } catch (error) {
    operationError = error;
  }

  const scopedErrors = [];
  for (const filter of [...filters].reverse()) {
    try {
      const error = await device.popErrorScope();
      if (error) scopedErrors.push(`${filter}: ${error.message}`);
    } catch (error) {
      scopedErrors.push(`${filter} scope failed: ${error.message}`);
    }
  }

  if (operationError || scopedErrors.length > 0) {
    const details = [];
    if (operationError) details.push(operationError.stack || operationError);
    details.push(...scopedErrors);
    throw new Error(`${label} failed:\n${details.join('\n')}`);
  }
  return result;
}

async function readCenterPixel(device, context, format, width, height) {
  return readPixel(device, context, format, width, height, 0.5, 0.5);
}

async function readPixel(
  device,
  context,
  format,
  width,
  height,
  normalizedX,
  normalizedY,
) {
  const bytesPerRow = 256;
  const readback = device.createBuffer({
    label: 'micro-gl smoke-test pixel readback',
    size: bytesPerRow,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder({
      label: 'micro-gl smoke-test pixel copy',
    });
    encoder.copyTextureToBuffer(
      {
        texture: context.getCurrentTexture(),
        origin: {
          x: normalizedPixelCoordinate(normalizedX, width),
          y: normalizedPixelCoordinate(normalizedY, height),
        },
      },
      { buffer: readback, bytesPerRow },
      { width: 1, height: 1 },
    );
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const stored = new Uint8Array(readback.getMappedRange(), 0, 4);
    const pixel = Array.from(stored);
    return format.startsWith('bgra')
      ? [pixel[2], pixel[1], pixel[0], pixel[3]]
      : pixel;
  } finally {
    if (readback.mapState === 'mapped') readback.unmap();
    readback.destroy();
  }
}

function normalizedPixelCoordinate(value, size) {
  return Math.min(size - 1, Math.max(0, Math.floor(value * size)));
}

function assertDominantColor(pixel, channel, label) {
  const competing = pixel.filter((_, index) => index < 3 && index !== channel);
  assert(
    pixel[channel] >= 160 && competing.every((value) => value <= 80),
    `${label}: received rgba(${pixel.join(', ')})`,
  );
}

function assertGrayPixel(pixel, expected, label, tolerance = 4) {
  const rgbMatches = pixel
    .slice(0, 3)
    .every((value) => Math.abs(value - expected) <= tolerance);
  assert(
    rgbMatches && pixel[3] >= 250,
    `${label}: expected rgba(${expected}±${tolerance}, ` +
      `${expected}±${tolerance}, ${expected}±${tolerance}, 255), received ` +
      `rgba(${pixel.join(', ')})`,
  );
}

function assertShadowContrast(shadowedPixel, litPixel) {
  const shadowLuminance = luminance(shadowedPixel);
  const litLuminance = luminance(litPixel);
  assert(
    litLuminance >= 180 && shadowLuminance <= litLuminance * 0.7,
    `directional shadow contrast: shadow rgba(${shadowedPixel.join(', ')}) ` +
      `has luminance ${shadowLuminance.toFixed(1)}, lit rgba(` +
      `${litPixel.join(', ')}) has luminance ${litLuminance.toFixed(1)}`,
  );
}

function luminance(pixel) {
  return pixel[0] * 0.2126 + pixel[1] * 0.7152 + pixel[2] * 0.0722;
}

function adapterDescription(device) {
  const info = device.adapterInfo;
  if (!info) return { description: 'not exposed by this browser' };
  return {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
  };
}

function countPipelineVariants(cache) {
  let count = 0;
  for (const variants of cache.values()) count += variants.size;
  return count;
}

function formatCompilationMessage(label, message) {
  const location = message.lineNum
    ? `:${message.lineNum}:${message.linePos || 1}`
    : '';
  return `${label}${location} [${message.type}] ${message.message}`;
}

function pass(checks, description) {
  checks.push(description);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class WebGpuUnavailableError extends Error {}
