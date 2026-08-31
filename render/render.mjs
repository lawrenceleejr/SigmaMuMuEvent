#!/usr/bin/env node
/* Render σμμ poster deliverables with headless Chromium.
 *
 *   node render/render.mjs still --format tabloid --ss 1 --t 0.13 --out out/x.png
 *   node render/render.mjs video --format ig --ss 2 --fps 30 --seconds 20 \
 *        --scale 1080x1350 --out out/x.mp4
 *
 * Video frames are piped straight into ffmpeg (image2pipe), so nothing large
 * ever lands on disk. Progress + ETA are logged every 30 frames.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.png': 'image/png',
};

function args() {
  const a = process.argv.slice(2);
  const mode = a.shift();
  const o = { mode, format: 'tabloid', ss: 1, fps: 30, seconds: 20, t: 0.13, out: 'out/poster.png', scale: '' };
  for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
  o.ss = parseFloat(o.ss); o.fps = parseInt(o.fps, 10);
  o.seconds = parseFloat(o.seconds); o.t = parseFloat(o.t);
  return o;
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = join(ROOT, path === '/' ? 'poster/index.html' : path);
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('nope');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

function findChromium() {
  return process.env.CHROMIUM_PATH || undefined; // else playwright registry
}

async function openPage(browser, opts) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const url = `http://127.0.0.1:${opts.port}/poster/index.html?format=${opts.format}&ss=${opts.ss}&anim=0&t=${opts.t}`;
  await page.goto(url);
  await page.waitForFunction('window.__posterReady === true', null, { timeout: 60000 });
  return page;
}

async function main() {
  const o = args();
  const { server, port } = await serve();
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars'],
  });
  const t0 = Date.now();
  try {
    const page = await openPage(browser, { ...o, port });
    const canvas = page.locator('canvas');

    if (o.mode === 'still') {
      await page.evaluate((u) => window.__setPhase(u), o.t);
      await canvas.screenshot({ path: o.out, type: 'png', timeout: 120000 });
      console.log(`[still ${o.format}] wrote ${o.out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } else if (o.mode === 'video') {
      const nFrames = Math.round(o.fps * o.seconds);
      const [sw, sh] = o.scale.split('x').map(Number);
      const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
        '-y', '-f', 'image2pipe', '-framerate', String(o.fps), '-c:v', 'png', '-i', '-',
        '-vf', `scale=${sw}:${sh}:flags=lanczos`,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
        '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        o.out,
      ], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let i = 0; i < nFrames; i++) {
        const u = i / nFrames;
        await page.evaluate((uu) => window.__setPhase(uu), u);
        const buf = await canvas.screenshot({ type: 'png', timeout: 60000 });
        if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
        if (i % 30 === 0 || i === nFrames - 1) {
          const el = (Date.now() - t0) / 1000;
          const eta = i ? el / (i + 1) * (nFrames - i - 1) : 0;
          console.log(`[video ${o.format}] frame ${i + 1}/${nFrames}  ${(100 * (i + 1) / nFrames).toFixed(0)}%  elapsed ${el.toFixed(0)}s  eta ${eta.toFixed(0)}s`);
        }
      }
      ff.stdin.end();
      const [code] = await once(ff, 'close');
      if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
      console.log(`[video ${o.format}] wrote ${o.out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } else {
      throw new Error(`unknown mode ${o.mode}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
