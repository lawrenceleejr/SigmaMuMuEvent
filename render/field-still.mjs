#!/usr/bin/env node
/* Render the static Feynman field used as the background of the Indico skin.
 *
 *   node render/field-still.mjs                    # 2000x1500 -> site/static/img/field-still.png
 *   node render/field-still.mjs --dark             # -> field-still-dark.png
 *   node render/field-still.mjs --w 2400 --h 1350 --scale 2.8
 *
 * It runs design/network.js, the generator that draws the poster, so the line
 * vocabulary and the physics are identical: straight fermions, drawn waves for
 * the bosons, dashes for the scalars, and a legal Standard Model vertex at
 * every junction. The output is palettised, which takes a 2000x1500 sheet of
 * line art from ~1.4 MB to ~330 KB with no visible loss.
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : Number(a[i + 1]); };
const W = arg('w', 2000), H = arg('h', 1500), SCALE = arg('scale', 2.4);
const SEED = arg('seed', 2026), COLORS = arg('colors', 64);
const DARK = a.includes('--dark');
const OUT = resolve(ROOT, `site/static/img/field-still${DARK ? '-dark' : ''}.png`);

const chromePath = process.env.CHROME
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ content: await readFile(resolve(ROOT, 'design/network.js'), 'utf8') });

const { png, edges } = await page.evaluate(({ W, H, SCALE, SEED, DARK }) => {
  const c = document.getElementById('c');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = DARK ? '#141312' : '#f5f0e1';
  ctx.fillRect(0, 0, W, H);
  const net = window.SMMNet.build({
    w: W, h: H, zones: [], seed: SEED, seeds: [{ x: W * 0.5, y: H * 0.5 }],
    spacing: 22, keep: 0.72, speed: 120, darts: 120000,
    pad: -SCALE * 26, clearance: 0, clearanceAt: () => 0, scaleAt: () => SCALE,
    cornerR: 0, maxLegs: 4, minSep: 0.42, minSepHard: 0.25, minComponent: 4,
    fermionShare: 0.5, higgsShare: 0.18, splitQuads: false,
    higgsPure: 8, higgsQuartics: 2,
  });
  for (const e of net.edges) {
    window.SMMNet.drawEdge(ctx, net, e, 1, {
      accent: DARK ? '#ff5230' : '#ec3013',
      ink: DARK ? '#efe9da' : undefined,
      tone: 0.9,
    });
  }
  return { png: c.toDataURL('image/png').split(',')[1], edges: net.edges.length };
}, { W, H, SCALE, SEED, DARK });

await writeFile(OUT, Buffer.from(png, 'base64'));
await browser.close();

await new Promise((ok, no) => {
  const p = spawn('python3', ['-c', `
from PIL import Image
import os
p = ${JSON.stringify(OUT)}
before = os.path.getsize(p) / 1024
im = Image.open(p).convert('RGB')
im.quantize(colors=${COLORS}, method=Image.MEDIANCUT,
            dither=Image.FLOYDSTEINBERG).save(p, optimize=True)
print('  %d KB -> %d KB palettised' % (before, os.path.getsize(p) / 1024))
`], { stdio: 'inherit' });
  p.on('exit', c => c === 0 ? ok() : no(new Error('palettise failed: ' + c)));
});
console.log(`wrote ${OUT}\n  ${W}x${H}, ${edges} edges at scale ${SCALE}`);
