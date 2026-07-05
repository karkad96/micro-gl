---
name: verify
description: How to verify micro-gl changes end-to-end - serve the demo, drive it headless with puppeteer-core + system Chrome, capture screenshots and HUD state.
---

# Verifying micro-gl

The only surface is the demo page (index.html + main.js) rendering to a
WebGPU canvas. There are no tests; verification is running the demo and
looking at it.

## Serve

```bash
npx -y serve . -l 3123    # run in background
```

Do NOT use Python's http.server — it serves .js with a MIME type that
breaks ES module loading.

## Drive

Use puppeteer-core with the system Chrome (`npm install puppeteer-core`
in a scratch dir; Chrome lives at
`C:/Program Files/Google/Chrome/Application/chrome.exe`):

```js
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
```

Screenshot the REAL demo page. Ad-hoc test pages hang in
`navigator.gpu.requestAdapter()` — don't write them.

## Gotchas

- `page.goto(url + '/#2d')` from the already-open page is a
  same-document navigation: main() does NOT re-run and the hash is
  ignored. Test `#2d` boot in a fresh page/browser.
- Wait ~1s after load before screenshotting so the FPS HUD has sampled.
- `/favicon.ico` 404s — pre-existing, ignore.

## What to check

- HUD state via DOM: `#fps-value`, `#fps-detail` (shows `N objects` =
  renderer drawCount), `#btn-stress` text, `.active` on `#btn-3d`/`#btn-2d`.
- 3D boot shows `4 objects` (ground, cube, sphere, satellite); 2D shows
  `4 objects` (card, disc, overlay, satellite).
- Stress button cycles 0 → 500 → 2,000 → 8,000 → off; counts are N + 4.
  Cycling back to off exercises Object3D/Object2D `dispose()` — watch
  the console for WebGPU validation errors (destroyed buffer use).
- Drag with `page.mouse` (emits pointer events): cube is near screen
  center-left ~(550, 370) at boot; dragging it should brighten it, move
  it, and the yellow satellite follows. Clicking empty ground restores
  the color. Alt + left-drag orbits; right-drag pans; both must work
  again after an object drag ends.
- Keyboard: `c` toggles perspective/ortho, `t` toggles top-down; both
  ignored while the 2D engine is active.
