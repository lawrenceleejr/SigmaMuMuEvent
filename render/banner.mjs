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
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const b = await readFile(join(SITE, p));
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
    max-width: ${Math.round(W * 0.72)}px;
  }
  .rule {
    margin-top: auto;
    height: ${Math.max(2, Math.round(H * 0.005))}px;
    background: ${ACCENT};
    width: 100%;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 2em;
    margin-top: ${Math.round(H * 0.042)}px;
    font-size: ${Math.round(H * 0.055)}px;
    font-weight: 600;
    letter-spacing: .1em;
    text-transform: uppercase;
  }
  .where { color: ${INK}; }
  .url { color: ${INK}; opacity: .78; letter-spacing: .06em; text-transform: none; }
</style></head><body>
<div id="wrap">
  <canvas id="c" width="${W}" height="${H}"></canvas>
  <div id="veil"></div>
  <div id="veil2"></div>
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
await page.waitForTimeout(400);
await page.screenshot({ path: OUT });
await browser.close();
server.close();
console.log(`wrote ${OUT}`);
console.log(`  ${W}x${H} ${THEME}, ${edges} edges behind the type`);
