#!/usr/bin/env node
/* Render the USMCC meeting banner that sits above the Indico event title.
 *
 *   node render/banner.mjs                    # dark, 2400x1000
 *   node render/banner.mjs --theme light
 *   node render/banner.mjs --w 2400 --h 1000 --out out/banner.png
 *
 * Sized 2.4:1 to drop into the slot the current cream banner occupies, and
 * drawn at twice the width it is displayed at so it stays crisp on a phone.
 *
 * The field behind the type is the same design/network.js the poster uses, so
 * every vertex is a legal Standard Model vertex rather than decorative squiggle.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const a = process.argv.slice(2);
const num = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : Number(a[i + 1]); };
const str = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };

const THEME = str('theme', 'dark');
const DARK = THEME === 'dark';
const W = num('w', 2400), H = num('h', 1000);
const OUT = resolve(ROOT, str('out', `out/usmcc-2026-banner-${THEME}.png`));

const PAPER = DARK ? '#141312' : '#f5f0e1';
const INK = DARK ? '#efe9da' : '#201e1d';
const ACCENT = DARK ? '#ff5230' : '#ec3013';
const MUTED = DARK ? '#9b948a' : '#605d5d';

const SITE = resolve(ROOT, 'site/static');
const MIME = { '.css': 'text/css', '.woff2': 'font/woff2', '.js': 'text/javascript', '.png': 'image/png' };
// The mark is tinted to the title colour rather than left pure white, and the
// tint is done here rather than shipped as a second file, so it tracks the
// palette instead of drifting from it. One source shape serves both themes:
// only its alpha channel matters.
const MARK_SRC = resolve(ROOT, 'site/static/img/usmcc-mark-white.png');
const MARK_OUT = resolve(ROOT, `out/.usmcc-mark-${THEME}.png`);
await new Promise((ok, no) => {
  const p = spawn('python3', ['-c', `
from PIL import Image
import numpy as np
im = Image.open(${JSON.stringify(MARK_SRC)}).convert('RGBA')
a = np.array(im)
r, g, b = ${parseInt(INK.slice(1, 3), 16)}, ${parseInt(INK.slice(3, 5), 16)}, ${parseInt(INK.slice(5, 7), 16)}
a[:, :, 0], a[:, :, 1], a[:, :, 2] = r, g, b     # alpha untouched: the shape
Image.fromarray(a).save(${JSON.stringify(MARK_OUT)})
print('  mark tinted to ${INK}')
`], { stdio: 'inherit' });
  p.on('exit', c => c === 0 ? ok() : no(new Error('tint failed: ' + c)));
});
const MARK = '/mark.png';
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const b = await readFile(p === '/mark.png' ? MARK_OUT : join(SITE, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="http://127.0.0.1:${port}/fonts/fonts.css">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: ${PAPER}; font-family: Archivo, "Helvetica Neue", Arial, sans-serif; }
  #wrap { position: relative; width: ${W}px; height: ${H}px; }
  canvas, #veil, #veil2, #type { position: absolute; inset: 0; }
  /* a second, vertical wash: the footline crosses the busiest part of the mesh */
  #veil2 {
    background: linear-gradient(0deg,
      ${DARK ? 'rgba(20,19,18,.72) 0%, rgba(20,19,18,0) 26%'
             : 'rgba(245,240,225,.74) 0%, rgba(245,240,225,0) 26%'});
  }
  /* The type sits left of centre, so the field is knocked well back there and
     allowed to come forward on the right where nothing has to be read. */
  #veil {
    background: linear-gradient(100deg,
      ${DARK ? 'rgba(20,19,18,.96) 0%, rgba(20,19,18,.9) 44%, rgba(20,19,18,.58) 72%, rgba(20,19,18,.44) 100%'
             : 'rgba(245,240,225,.96) 0%, rgba(245,240,225,.9) 44%, rgba(245,240,225,.6) 72%, rgba(245,240,225,.48) 100%'});
  }
  #type { padding: ${Math.round(H * 0.115)}px ${Math.round(W * 0.045)}px; display: flex; flex-direction: column; }
  /* The official mark, on the far side from the type. It is the only other
     thing competing with the title, so it sits well clear of it and stops
     above the rule rather than straddling it. */
  #mark {
    position: absolute;
    right: ${Math.round(W * 0.045)}px;
    top: ${Math.round(H * 0.15)}px;
    height: ${Math.round(H * 0.35)}px;
    width: auto;
  }
  .kicker {
    color: ${ACCENT};
    font-size: ${Math.round(H * 0.062)}px;
    font-weight: 700;
    letter-spacing: .22em;
    text-transform: uppercase;
  }
  h1 {
    margin-top: ${Math.round(H * 0.055)}px;
    color: ${INK};
    font-size: ${Math.round(H * 0.132)}px;
    font-weight: 800;
    line-height: 1.02;
    letter-spacing: -.022em;
    max-width: ${Math.round(W * 0.6)}px;
  }
  .rule {
    margin-top: auto;
    max-width: ${Math.round(W * 0.78)}px;
    height: ${Math.max(2, Math.round(H * 0.005))}px;
    background: ${ACCENT};
    width: 100%;
  }
  .foot {
    max-width: ${Math.round(W * 0.78)}px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 2em;
    margin-top: ${Math.round(H * 0.042)}px;
    font-size: ${Math.round(H * 0.046)}px;
    font-weight: 600;
    letter-spacing: .09em;
    text-transform: uppercase;
  }
  /* neither half may wrap: the row is narrower now that the mark has the
     right-hand end of the banner */
  .foot > span { white-space: nowrap; }
  .where { color: ${INK}; }
  .url { color: ${INK}; opacity: .78; letter-spacing: .06em; text-transform: none; }
</style></head><body>
<div id="wrap">
  <canvas id="c" width="${W}" height="${H}"></canvas>
  <div id="veil"></div>
  <div id="veil2"></div>
  <img id="mark" src="http://127.0.0.1:${port}${MARK}" alt="">
  <div id="type">
    <div class="kicker">3rd Annual</div>
    <h1>US Muon Collider<br>Collaboration Meeting</h1>
    <div class="rule"></div>
    <div class="foot">
      <span class="where">Stanford, Dec. 13&ndash;16, 2026</span>
      <span class="url">indico.muoncollider.us/e/usmcc2026</span>
    </div>
  </div>
</div></body></html>`;

const chromePath = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.setContent(html, { waitUntil: 'load' });
await page.addScriptTag({ content: await readFile(resolve(ROOT, 'design/network.js'), 'utf8') });

const edges = await page.evaluate(({ W, H, INK, ACCENT, DARK }) => {
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  const net = window.SMMNet.build({
    w: W, h: H, zones: [], seed: 66, seeds: [{ x: W * 0.78, y: H * 0.5 }],
    spacing: 34, keep: 0.72, speed: 120, darts: 90000,
    pad: -80, clearance: 0, clearanceAt: () => 0, scaleAt: () => 2.9,
    cornerR: 0, maxLegs: 4, minSep: 0.42, minSepHard: 0.25, minComponent: 4,
    fermionShare: 0.5, higgsShare: 0.18, splitQuads: false,
    higgsPure: 5, higgsQuartics: 1,
  });
  for (const e of net.edges) {
    window.SMMNet.drawEdge(ctx, net, e, 1, { accent: ACCENT, ink: INK, tone: 0.95 });
  }
  return net.edges.length;
}, { W, H, INK, ACCENT, DARK });

await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => {
  const m = document.getElementById('mark');
  return m && m.complete && m.naturalWidth > 0;
});
await page.waitForTimeout(400);
// Nothing may wrap, overflow, or collide with the mark. A banner is a single
// flat image — a layout fault here is invisible until it is on the page.
const layout = await page.evaluate(() => {
  const r = el => el.getBoundingClientRect();
  const mark = r(document.getElementById('mark'));
  const foot = [...document.querySelectorAll('.foot > span')].map(s => r(s));
  const h1 = r(document.querySelector('h1'));
  return {
    markInside: mark.right <= innerWidth + 0.5 && mark.top >= -0.5 && mark.bottom <= innerHeight + 0.5,
    footLines: foot.map(f => Math.round(f.height)),
    footClearsMark: foot.every(f => f.right <= mark.left + 0.5 || f.bottom <= mark.top + 0.5),
    titleClearsMark: h1.right <= mark.left + 0.5,
    lineHeight: Math.round(parseFloat(getComputedStyle(document.querySelector('.foot')).fontSize) * 1.4),
  };
});
const oneLine = layout.footLines.every(h => h <= layout.lineHeight);
if (!layout.markInside || !oneLine || !layout.footClearsMark || !layout.titleClearsMark) {
  console.error('  LAYOUT FAULT', JSON.stringify(layout));
  process.exitCode = 1;
} else {
  console.log(`  layout ok: mark inside, footline on one line, nothing overlapping the mark`);
}
await page.screenshot({ path: OUT });
await browser.close();
server.close();

// Palettise. Flat ground, one accent and a bone type set means 256 colours is
// indistinguishable from truecolour here — checked against the gradient, which
// is the only place banding could show — and it more than halves the file. A
// banner is a logo upload, and some Indico deployments cap those.
await new Promise((ok, no) => {
  const p = spawn('python3', ['-c', `
from PIL import Image
import os
p = ${JSON.stringify(OUT)}
before = os.path.getsize(p) / 1024
im = Image.open(p).convert('RGB')
im.quantize(colors=256, method=Image.MEDIANCUT,
            dither=Image.FLOYDSTEINBERG).save(p, optimize=True)
print('  %d KB -> %d KB palettised' % (before, os.path.getsize(p) / 1024))
`], { stdio: 'inherit' });
  p.on('exit', c => c === 0 ? ok() : no(new Error('palettise failed: ' + c)));
});
console.log(`wrote ${OUT}`);
console.log(`  ${W}x${H} ${THEME}, ${edges} edges behind the type`);
