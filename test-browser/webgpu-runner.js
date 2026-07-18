import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

// Kept outside Node's *.test.js discovery so this real-browser suite is opt-in.

const WORKSPACE_ROOT = resolve(
  fileURLToPath(new URL('..', import.meta.url)),
);
const REQUIRE_WEBGPU = process.env.MICRO_GL_REQUIRE_WEBGPU === '1';
const TEST_TIMEOUT_MS = 120_000;
const BROWSER_OPERATION_TIMEOUT_MS = 100_000;

test(
  'stock pipelines compile and render in a real WebGPU browser',
  { timeout: TEST_TIMEOUT_MS },
  async (t) => {
    const browserPath = process.env.MICRO_GL_BROWSER_PATH;
    if (!browserPath) {
      return skipOrFail(
        t,
        'Browser executable is not configured; copy .env.example to .env and set MICRO_GL_BROWSER_PATH',
      );
    }
    if (!existsSync(browserPath)) {
      return skipOrFail(
        t,
        `Configured browser executable does not exist: ${browserPath}`,
      );
    }

    const server = createStaticServer();
    const browserErrors = [];
    let browser = null;
    try {
      const port = await listen(server);
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: process.env.MICRO_GL_HEADED !== '1',
        args: [...defaultBrowserArgs(), ...extraBrowserArgs()],
      });
      const page = await browser.newPage({
        viewport: { width: 640, height: 480 },
      });
      page.on('pageerror', (error) => {
        browserErrors.push(`pageerror: ${error.stack || error.message}`);
      });
      page.on('console', (message) => {
        if (message.type() === 'error') {
          browserErrors.push(`console: ${message.text()}`);
        }
      });

      const response = await page.goto(
        `http://127.0.0.1:${port}/test-browser/index.html`,
        { waitUntil: 'load' },
      );
      assert.ok(response?.ok(), `fixture returned HTTP ${response?.status()}`);
      await page.waitForFunction(
        () => Boolean(globalThis.__microGlWebGpuSmoke),
        null,
        { timeout: 10_000 },
      );
      const result = await withTimeout(
        page.evaluate(() => globalThis.__microGlWebGpuSmoke),
        BROWSER_OPERATION_TIMEOUT_MS,
        'WebGPU smoke fixture did not settle',
      );

      if (result.status === 'skipped') {
        return skipOrFail(t, result.reason);
      }
      assert.equal(
        result.status,
        'passed',
        formatResultFailure(result, browserErrors),
      );
      assert.deepEqual(
        browserErrors,
        [],
        `browser emitted errors:\n${browserErrors.join('\n')}`,
      );

      t.diagnostic(`browser: ${browserPath}`);
      t.diagnostic(`adapter: ${JSON.stringify(result.adapter)}`);
      for (const check of result.checks) t.diagnostic(`pass: ${check}`);
      for (const warning of result.warnings) {
        t.diagnostic(`WGSL warning: ${warning}`);
      }
    } finally {
      if (browser) await browser.close();
      await closeServer(server);
    }
  },
);

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }

      const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const filePath = resolve(WORKSPACE_ROOT, relativePath);
      if (
        filePath !== WORKSPACE_ROOT &&
        !filePath.startsWith(`${WORKSPACE_ROOT}${sep}`)
      ) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentType(filePath),
      });
      response.end(body);
    } catch (error) {
      const status = error.code === 'ENOENT' ? 404 : 500;
      response.writeHead(status).end(error.message);
    }
  });
}

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolvePromise(server.address().port);
    });
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  server.closeAllConnections?.();
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

async function withTimeout(promise, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function defaultBrowserArgs() {
  const common = ['--enable-unsafe-webgpu'];
  if (process.platform !== 'linux') return common;
  return [
    ...common,
    '--use-angle=vulkan',
    '--enable-features=Vulkan',
    '--disable-vulkan-surface',
  ];
}

function extraBrowserArgs() {
  const value = process.env.MICRO_GL_BROWSER_ARGS;
  if (!value) return [];
  const args = JSON.parse(value);
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('MICRO_GL_BROWSER_ARGS must be a JSON string array');
  }
  return args;
}

function contentType(filePath) {
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
    }[extname(filePath)] || 'application/octet-stream'
  );
}

function skipOrFail(t, reason) {
  if (REQUIRE_WEBGPU) assert.fail(reason);
  t.skip(reason);
}

function formatResultFailure(result, browserErrors) {
  const details = [result.error, result.stack, ...browserErrors].filter(Boolean);
  return details.join('\n') || JSON.stringify(result);
}
