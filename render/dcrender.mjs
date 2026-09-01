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
import { writeFile } from 'node:fs/promises';
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
    scale: 2, fps: 60, seconds: 14, out: 'out/dc.png', settle: 2500, start: 0, fast: '0',
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
  // Capturing a frame takes far longer than a frame lasts, so real time would
  // race ahead of the recording. Video mode freezes the page clock and steps it
  // by hand, one frame at a time.
  if (o.mode === 'video') {
    const T0 = new Date('2026-12-13T16:30:00Z');
    await page.clock.install({ time: T0 });
    await page.clock.pauseAt(T0);
  }
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
  // a clip never reaches past the viewport, so make the viewport fit the sheet
  const size = await page.locator(`[data-screen-label="${o.screen}"]`)
    .evaluate((el) => ({ w: el.offsetWidth, h: el.offsetHeight }));
  await page.setViewportSize({ width: size.w + 400, height: size.h + 400 });
  // Real time still passes while the clock is frozen, so fonts load and the
  // sketch boots without the animation advancing a single frame.
  await page.waitForTimeout(o.settle);

  // Chromium re-rasterises the whole page for every capture, so a sheet we are
  // not shooting still costs us on each frame. Hide the others.
  if (o.mode === 'video') {
    await page.evaluate((screen) => {
      document.querySelectorAll('[data-screen-label]').forEach((el) => {
        if (el.getAttribute('data-screen-label') !== screen) {
          const col = el.closest('div');
          if (col) col.style.display = 'none';
        }
      });
    }, o.screen);
  }

  // The ink filters are re-evaluated on every captured frame. Dropping them
  // gives a quick preview of timing and layout.
  if (String(o.fast) === '1') {
    await page.evaluate(() => {
      document.querySelectorAll('[style*="filter:url("]').forEach((el) => {
        el.style.filter = 'none';
      });
    });
    console.log('[dc] fast mode: ink filters off for this capture');
  }
  return { page, errs };
}

/* crop a PNG buffer to exactly w x h (the compositor can hand back a stray
   half pixel on fractional layouts), and encode to jpeg when that is asked for */
function exact(buf, w, h, jpeg) {
  return new Promise((res, rej) => {
    const codec = jpeg
      ? ['-q:v', '2', '-pix_fmt', 'yuvj444p', '-c:v', 'mjpeg']
      : ['-c:v', 'png'];
    const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
      '-loglevel', 'error', '-i', '-', '-vf', `crop=${w}:${h}:0:0`,
      '-frames:v', '1', '-f', 'image2pipe', ...codec, '-',
    ], { stdio: ['pipe', 'pipe', 'inherit'] });
    const out = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.on('close', (c) => (c === 0 ? res(Buffer.concat(out)) : rej(new Error(`crop exited ${c}`))));
    ff.stdin.end(buf);
  });
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
    // the element box carries sub-pixel offsets; the artboard's own CSS size is
    // the true page size, so clip to that and a 3x tabloid lands on 3300x5100
    const css = await art.evaluate((el) => ({ w: el.offsetWidth, h: el.offsetHeight }));
    if (!box) throw new Error('artboard has no box');
    console.log(`[dc] ${o.screen} ${css.w}x${css.h} css @${o.scale}x -> ${css.w * o.scale}x${css.h * o.scale}`);
    if (errs.length) console.log('[dc] page errors:', errs.slice(0, 5).join(' | '));

    if (o.mode === 'shot') {
      const buf = await art.screenshot({ type: 'png', timeout: 180000 });
      const jpeg = /\.jpe?g$/i.test(o.out);
      await writeFile(o.out, await exact(buf, css.w * o.scale, css.h * o.scale, jpeg));
      console.log(`[dc] wrote ${o.out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } else if (o.mode === 'video') {
      const n = Math.round(o.fps * o.seconds);
      const stepMs = 1000 / o.fps;
      // the sketch redraws no faster than every 15ms; a shorter step than that
      // would just repeat frames
      if (stepMs < 15) console.log(`[dc] warning: ${o.fps}fps steps ${stepMs.toFixed(1)}ms, below the sketch's 15ms redraw throttle -- frames will repeat`);
      const w = Math.round(css.w * o.scale / 2) * 2;
      const h = Math.round(css.h * o.scale / 2) * 2;
      // One long-lived ffmpeg, fed jpeg frames: encoding a PNG per frame in the
      // browser and then spawning a cropper per frame was costing more than the
      // page render itself. Cropping happens here, in the same filter chain.
      const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
        '-y', '-f', 'image2pipe', '-framerate', String(o.fps), '-c:v', 'mjpeg', '-i', '-',
        '-vf', `crop=${w}:${h}:0:0`, '-c:v', 'libx264', '-preset', 'medium',
        '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        o.out,
      ], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let i = 0; i < n; i++) {
        if (i) await page.clock.runFor(stepMs);
        const buf = await art.screenshot({ type: 'jpeg', quality: 95, timeout: 120000 });
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
