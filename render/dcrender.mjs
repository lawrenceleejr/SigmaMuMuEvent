#!/usr/bin/env node
/* Render Claude Design (.dc.html) artboards headlessly.
 *
 *   node render/dcrender.mjs shot   --file "design/Sigma Mu Mu Network.dc.html" \
 *        --screen TABLOID --scale 3 --out out/tabloid.png
 *   node render/dcrender.mjs video  --file "..." --screen INSTAGRAM --seconds 24 \
 *        --fps 30 --scale 1 --out out/ig.mp4
 *
 * The canvas runs its own DC runtime; we wait for the network build to settle,
 * then screenshot the artboard element. Video mode captures real animation frames.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { extname, join, resolve } from 'node:path';
import pw from 'playwright-core';
const { chromium } = pw;

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml',
};

function args() {
  const a = process.argv.slice(2);
  const mode = a.shift();
  const o = {
    mode, file: 'design/Sigma Mu Mu Network.dc.html', screen: 'TABLOID',
    scale: 2, fps: 30, seconds: 24, out: 'out/dc.png', settle: 2500, start: 0,
  };
  for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
  o.scale = parseFloat(o.scale); o.fps = parseInt(o.fps, 10);
  o.seconds = parseFloat(o.seconds); o.settle = parseFloat(o.settle);
  o.start = parseFloat(o.start);
  return o;
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const body = await readFile(join(ROOT, p));
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

/* the DC runtime pulls React (and Babel) from unpkg; serve the vendored copies
   so a render never depends on the network */
const CDN = [
  [/^https:\/\/unpkg\.com\/react@[\d.]+\/umd\/react\.production\.min\.js/,
   'design/assets/vendor/react.production.min.js', 'text/javascript'],
  [/^https:\/\/unpkg\.com\/react-dom@[\d.]+\/umd\/react-dom\.production\.min\.js/,
   'design/assets/vendor/react-dom.production.min.js', 'text/javascript'],
  [/^https:\/\/unpkg\.com\/@babel\/standalone@[\d.]+\/babel\.min\.js/,
   'design/assets/vendor/babel.min.js', 'text/javascript'],
];

export async function open(o, port, browser) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 }, deviceScaleFactor: o.scale,
  });
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const hit = CDN.find(([re]) => re.test(url));
    if (hit) {
      return route.fulfill({
        status: 200, contentType: hit[2], body: await readFile(join(ROOT, hit[1])),
      });
    }
    if (/^https?:\/\/(?!127\.0\.0\.1|localhost)/.test(url)) {
      // nothing else may reach the network: assets are vendored on purpose
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/${encodeURI(o.file)}`, { waitUntil: 'load' });
  await page.waitForSelector(`[data-screen-label="${o.screen}"]`, { timeout: 30000 });
  await page.waitForTimeout(o.settle);
  return { page, errs };
}

async function main() {
  const o = args();
  const { server, port } = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--force-color-profile=srgb', '--hide-scrollbars',
           '--disable-features=SRIMessageSignatureEnforcement'],
    ignoreHTTPSErrors: true,
  });
  const t0 = Date.now();
  try {
    const { page, errs } = await open(o, port, browser);
    const art = page.locator(`[data-screen-label="${o.screen}"]`);
    const box = await art.boundingBox();
    console.log(`[dc] ${o.screen} box ${box.width}x${box.height} @${o.scale}x`);
    if (errs.length) console.log('[dc] page errors:', errs.slice(0, 5).join(' | '));

    if (o.mode === 'shot') {
      await art.screenshot({ path: o.out, type: 'png', timeout: 180000 });
      console.log(`[dc] wrote ${o.out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } else if (o.mode === 'video') {
      const n = Math.round(o.fps * o.seconds);
      const w = Math.round(box.width * o.scale / 2) * 2;
      const h = Math.round(box.height * o.scale / 2) * 2;
      const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
        '-y', '-f', 'image2pipe', '-framerate', String(o.fps), '-c:v', 'png', '-i', '-',
        '-vf', `scale=${w}:${h}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow',
        '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        o.out,
      ], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let i = 0; i < n; i++) {
        const buf = await art.screenshot({ type: 'png', timeout: 120000 });
        if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
        if (i % 30 === 0 || i === n - 1) {
          const el = (Date.now() - t0) / 1000;
          const eta = i ? el / (i + 1) * (n - i - 1) : 0;
          console.log(`[dc] frame ${i + 1}/${n} ${(100 * (i + 1) / n).toFixed(0)}% elapsed ${el.toFixed(0)}s eta ${eta.toFixed(0)}s`);
        }
      }
      ff.stdin.end();
      const [code] = await once(ff, 'close');
      if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
      console.log(`[dc] wrote ${o.out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } else throw new Error(`unknown mode ${o.mode}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
