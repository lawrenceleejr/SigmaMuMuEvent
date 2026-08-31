#!/usr/bin/env node
/* Generate poster/preview.html — a self-contained live preview of the σμμ
 * poster (Google-hosted fonts, cdnjs p5, the sketch inlined verbatim) with a
 * small press-room chrome: format chips, loop-phase hairline, pause control.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const sketch = await readFile(resolve(ROOT, 'poster/sketch.js'), 'utf8');
if (sketch.includes('</script')) throw new Error('sketch source would break inline embedding');

const head = `<meta charset="utf-8">
<title>σμμ Poster Proof</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  /* single committed theme: the poster's own press-table world */
  :root {
    --table: #26231d;
    --table-edge: #1c1a15;
    --paper: #f5f1e6;
    --red: #d8371d;
    --label: #a69d8c;
    --label-dim: #6f685c;
    --sans: "Inter Tight", "Helvetica Neue", Arial, sans-serif;
    --mono: "JetBrains Mono", ui-monospace, "Courier New", monospace;
  }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--table); color: var(--paper);
    font-family: var(--sans); display: flex; flex-direction: column;
    overflow: hidden;
  }
  header {
    display: flex; align-items: baseline; gap: 20px; flex-wrap: wrap;
    padding: 14px 22px 10px;
  }
  .brand { font-weight: 800; font-size: 22px; letter-spacing: -0.01em; }
  .brand small {
    font-family: var(--mono); font-weight: 500; font-size: 10px;
    letter-spacing: 0.22em; color: var(--red); margin-left: 10px;
  }
  nav { margin-left: auto; display: flex; gap: 4px; flex-wrap: wrap; }
  nav button {
    appearance: none; background: none; border: 0; cursor: pointer;
    font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.14em;
    color: var(--label); padding: 6px 9px; border-bottom: 2px solid transparent;
  }
  nav button:hover { color: var(--paper); }
  nav button:focus-visible { outline: 1px solid var(--red); outline-offset: 2px; }
  nav button[aria-pressed="true"] { color: var(--paper); border-bottom-color: var(--red); }
  .rule { height: 2px; background: var(--table-edge); }
  .rule i { display: block; height: 100%; width: 0; background: var(--red); }
  main {
    flex: 1; min-height: 0; display: grid; place-items: center; padding: 26px;
  }
  main canvas {
    box-shadow: 0 34px 90px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(245, 241, 230, 0.07);
    cursor: pointer;
  }
  .meta {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
    color: var(--label-dim); text-align: center; padding: 0 22px 16px;
  }
  .meta b { color: var(--label); font-weight: 500; }
</style>
<header>
  <div class="brand">σμμ<small>POSTER PROOF</small></div>
  <nav id="formats" aria-label="Poster format"></nav>
</header>
<div class="rule"><i id="ph"></i></div>
<main id="stage"></main>
<div class="meta" id="meta">SEAMLESS 20 S LOOP · CLICK OR SPACE PAUSES · <b>SUN DEC 13 2026 · 5:00 PM · STANFORD CAMPUS</b></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.7/p5.min.js"></script>
`;

const ui = `<script>
(function () {
  var SRC = document.getElementById('sketch-src').textContent;
  var SIZES = {
    tabloid:  { label: 'TABLOID 11\\u00d717', w: 1100, h: 1700 },
    ig:       { label: 'FEED 4:5',            w: 1080, h: 1350 },
    igsq:     { label: 'SQUARE',              w: 1080, h: 1080 },
    story:    { label: 'STORY 9:16',          w: 1080, h: 1920 },
    linkedin: { label: 'LINKEDIN',            w: 1200, h: 627 },
    livideo:  { label: 'WIDE 16:9',           w: 1440, h: 810 },
  };
  var current = 'tabloid';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = document.getElementById('formats');

  Object.keys(SIZES).forEach(function (key) {
    var b = document.createElement('button');
    b.textContent = SIZES[key].label;
    b.dataset.format = key;
    b.setAttribute('aria-pressed', String(key === current));
    b.addEventListener('click', function () { run(key); });
    nav.appendChild(b);
  });

  function stageBox() {
    // clientWidth/Height include the stage's padding; keep the canvas inside it
    var s = document.getElementById('stage');
    return { w: s.clientWidth - 64, h: s.clientHeight - 64 };
  }

  function run(format) {
    current = format;
    nav.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.format === format));
    });
    try { if (window.__P5) window.__P5.remove(); } catch (e) {}
    var box = stageBox();
    window.POSTER_CONFIG = {
      format: format, w: SIZES[format].w, h: SIZES[format].h,
      parent: 'stage', anim: 1, fitW: box.w, fitH: box.h,
    };
    new Function(SRC)();
    whenReady(function () { if (reduced || paused) freeze(); });
  }

  var paused = false;
  function freeze() { if (window.__P5) { window.__P5.noLoop(); paused = true; } }
  function thaw() { if (window.__P5) { window.__P5.loop(); paused = false; } }
  function toggle() { paused ? thaw() : freeze(); }
  function whenReady(fn) {
    (function poll() { window.__posterReady && window.__P5 ? fn() : setTimeout(poll, 60); })();
  }

  document.getElementById('stage').addEventListener('click', function (e) {
    if (e.target.tagName === 'CANVAS') toggle();
  });
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); toggle(); }
  });

  var ph = document.getElementById('ph');
  (function tick() {
    ph.style.width = ((window.__phase || 0) * 100).toFixed(2) + '%';
    requestAnimationFrame(tick);
  })();

  var rto;
  window.addEventListener('resize', function () {
    clearTimeout(rto); rto = setTimeout(function () { run(current); }, 220);
  });

  run(current);
})();
</` + `script>
`;

const html = head
  + '<script id="sketch-src" type="text/plain">\n' + sketch + '\n</' + 'script>\n'
  + ui;

await writeFile(resolve(ROOT, 'poster/preview.html'), html);
console.log('[build_preview] wrote poster/preview.html',
  `(${(html.length / 1024).toFixed(0)} KiB)`);
