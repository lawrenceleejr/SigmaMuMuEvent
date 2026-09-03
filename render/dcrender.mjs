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
 *
 * Video supersamples by default (--ss 2): frames are captured at twice the
 * output size and downscaled in the encode. At one device pixel per CSS pixel
 * the small type came out with uneven letter gaps -- the artboard is laid out
 * in CSS pixels, its smallest type is 10px, and at that size a browser rounds
 * each glyph's position to a whole pixel, so a 0.02em tracking that should be
 * a fifth of a pixel lands as nothing or as a whole one, unpredictably. The
 * still never showed it because it has always been captured at 2x and
 * downsampled. --ss 1 restores the old, cheaper capture for previews.
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
    ss: 2,
  };
  for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
  o.scale = parseFloat(o.scale); o.fps = parseInt(o.fps, 10);
  o.ss = Math.max(1, parseFloat(o.ss));
  // A still names its own resolution with --scale and is downscaled by the
  // caller if at all; only video supersamples inside this script.
  if (o.mode !== 'video') o.ss = 1;
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
    viewport: { width: 1600, height: 1200 }, deviceScaleFactor: o.scale * o.ss,
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
  /* Wait for the type before waiting for the picture, and say so if it never
     arrives. The canvas asks for 45 font files across 91 faces; a settle
     timer that happens to be long enough on one machine is not a guarantee on
     another, and when the faces lose that race the sheet is laid out in a
     fallback -- which is not a subtle defect. Measured on a render that lost
     it: the URL under the QR came out 159px of ink where Archivo gives 246.
     Nothing in the output says which one you got, so it is asserted here. */
  // Each family is probed with a string it actually sets: a math face need not
  // carry Latin, and testing it with a URL fails it for the wrong reason.
  const NEEDED = [['700 18px Archivo', 'hepalumni.muoncollider.us'],
                  ['400 18px "Libertinus Math"', '\u03c3\u03bc\u03bc']];
  await page.evaluate(() => document.fonts.ready);
  /* Measured, not asked. document.fonts.check() reports false for these
     families even when they are plainly in use -- the faces are subsetted
     across 91 declarations and come from a stylesheet of the canvas's own --
     so a gate built on it refuses every render. Setting the same string in
     the family and in a family that cannot exist, and requiring the two to
     measure differently, is a question the browser answers honestly. */
  const missing = await page.waitForFunction((want) => {
    const c = document.createElement('canvas').getContext('2d');
    const gone = want.filter(([f, T]) => {
      c.font = f; const real = c.measureText(T).width;
      c.font = f.replace(/(["'][^"']+["']|[^ ]+)$/, '"no-such-family-8f21"');
      return Math.abs(real - c.measureText(T).width) < 0.5;
    }).map(([f]) => f);
    return gone.length ? (document.fonts.status === 'loaded' ? gone : false) : [];
  }, NEEDED, { timeout: 60000 }).then((h) => h.jsonValue());
  if (missing.length) {
    throw new Error(`fonts never loaded: ${missing.join(', ')} -- the sheet would `
      + 'render in a fallback face');
  }
  console.log('[dc] fonts resolved');

  // Real time still passes while the clock is frozen, so the sketch boots
  // without the animation advancing a single frame.
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
/* Width and height out of a JPEG's first start-of-frame marker. Cheaper than
   handing the whole frame back to the page to be decoded. */
function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + (i + 3 < buf.length ? buf.readUInt16BE(i + 2) : 0);
  }
  return null;
}

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
    console.log(`[dc] ${o.screen} ${css.w}x${css.h} css @${o.scale}x`
      + `${o.ss > 1 ? ` (captured @${o.scale * o.ss}x)` : ''}`
      + ` -> ${css.w * o.scale}x${css.h * o.scale}`);
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
      // Captured size, and the size it is encoded at. Both even, because
      // yuv420p halves the chroma planes.
      const cw = Math.round(css.w * o.scale * o.ss / 2) * 2;
      const ch = Math.round(css.h * o.scale * o.ss / 2) * 2;
      const w = Math.round(css.w * o.scale / 2) * 2;
      const h = Math.round(css.h * o.scale / 2) * 2;
      const chain = o.ss > 1
        ? `crop=${cw}:${ch}:0:0,scale=${w}:${h}:flags=lanczos`
        : `crop=${w}:${h}:0:0`;
      if (o.ss > 1) {
        console.log(`[dc] supersampling ${o.ss}x: capturing ${cw}x${ch}, encoding ${w}x${h}`);
      }
      // One long-lived ffmpeg, fed jpeg frames: encoding a PNG per frame in the
      // browser and then spawning a cropper per frame was costing more than the
      // page render itself. Cropping happens here, in the same filter chain.
      const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
        '-y', '-f', 'image2pipe', '-framerate', String(o.fps), '-c:v', 'mjpeg', '-i', '-',
        '-vf', chain, '-c:v', 'libx264', '-preset', 'medium',
        '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        o.out,
      ], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let i = 0; i < n; i++) {
        if (i) await page.clock.runFor(stepMs);
        const buf = await art.screenshot({ type: 'jpeg', quality: 95, timeout: 120000 });
        // DC_DEBUG=1 reports the captured geometry once. Worth having: the
        // element screenshot comes back a couple of rows taller than the
        // sheet, and whether the crop and the scale agree with it is not
        // something the finished video tells you.
        if (!i && process.env.DC_DEBUG) {
          const d = jpegSize(buf);
          console.log(`[dc] captured ${d ? `${d.w}x${d.h}` : 'unknown'}; `
            + `cropping ${cw}x${ch}, encoding ${w}x${h}`);
        }
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
