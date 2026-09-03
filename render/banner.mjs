#!/usr/bin/env node
/* Render a banner to sit above an Indico event title.
 *
 *   node render/banner.mjs                    # USMCC meeting, dark, 2400x1000
 *   node render/banner.mjs --theme light
 *   node render/banner.mjs --event smm        # the sigma-mu-mu reunion
 *   node render/banner.mjs --event smm --theme dark
 *   node render/banner.mjs --w 2400 --h 1000 --out out/banner.png
 *
 * Two events, one layout: a kicker, a title, the official mark on the far
 * side, a rule and a footline, over the field. The sigma-mu-mu banner leads
 * with the poster's lockup instead of a text title, which is the one thing
 * that differs -- the sigma set large in Libertinus Math with the mu mu at
 * half its size, exactly the proportion site/assets/css/main.css uses.
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
const EVENT = str('event', 'usmcc');
const W = num('w', 2400), H = num('h', 1000);

// Strings live here rather than being read from the Hugo front matter: a
// banner is a flat image checked by eye once and then uploaded, and reaching
// into the site's content for it would tie a render to a content edit.
const EVENTS = {
  usmcc: {
    slug: 'usmcc-2026-banner',
    seed: 66,
    kicker: '3rd Annual',
    title: 'US Muon Collider<br>Collaboration Meeting',
    where: 'Stanford, Dec. 13&ndash;16, 2026',
    url: 'indico.muoncollider.us/e/usmcc2026',
  },
  smm: {
    slug: 'sigmamumu-banner',
    seed: 2026,
    kicker: 'USMCC Annual Meeting &middot; Stanford',
    lockup: true,
    title: 'A Particle Physics<br>Alumni Reunion',
    tagline: 'Cocktail hour &times; Research fair',
    where: 'Sunday 13 December 2026 &middot; 4:30&ndash;6:30 p.m.',
    url: 'hepalumni.muoncollider.us',
  },
};
const E = EVENTS[EVENT];
// The lockup's sigma, and with it the whole mark: everything else in the
// lockup is a ratio of this. Sized so the mu mu's descender clears the rule,
// which the layout audit checks rather than trusts.
const SIG = Math.round(num('sig', 0.44) * H);
// How far the title sits from the lockup.
const GAP = Math.round(num('gap', 0.05) * W);
if (!E) { console.error(`unknown --event ${EVENT}; try ${Object.keys(EVENTS).join(' or ')}`); process.exit(1); }
const OUT = resolve(ROOT, str('out', `out/${E.slug}-${THEME}.png`));

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
    res.writeHead(200, {
      'content-type': MIME[extname(p)] || 'application/octet-stream',
      // Fonts are fetched under CORS, and setContent gives the page no origin
      // of its own, so every @font-face here failed with ERR_FAILED and the
      // whole banner quietly set in the browser's fallback sans. Nothing said
      // so; it just was not Archivo.
      'access-control-allow-origin': '*',
    });
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
    font-size: ${Math.round(H * (E.lockup ? 0.045 : 0.062))}px;
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
  /* The reunion banner leads with the poster's lockup, so the title sits
     beside it rather than carrying the frame on its own: the sigma is the
     thing to recognise from across a room. Proportions are the site's --
     Libertinus Math, the mu mu just under half the sigma, nudged up and
     right so it tucks under the sigma's shoulder. */
  /* Shrink-wrapped, not full width: a block row would reach under the mark
     and there would be no way to tell a real collision from a wide box. */
  /* The gap is a flex gap, so it measures from the lockup's layout box -- and
     the mu mu reaches past the sigma inside that box while being offset down,
     which is what made 31px of gap read as almost touching. The audit reports
     the clearance that matters instead: mu mu ink to title ink. */
  #row { display: flex; align-self: flex-start; align-items: center;
         gap: ${GAP}px; margin-top: ${Math.round(H * 0.012)}px;
         flex: 1 1 auto; }
  /* The poster's own stack, in the poster's own order: design/Sigma Mu Mu
     Network.dc.html sets 'Libertinus Math','KaTeX Math',serif. The render
     asserts the first one actually loaded, because a silent fall back to a
     system serif is exactly the kind of thing nobody notices until it is
     printed beside the poster. */
  .lockup {
    flex: none;
    color: ${INK};
    font-family: "Libertinus Math", "KaTeX Math", serif;
    font-weight: 400;
    line-height: .8;
    white-space: nowrap;
  }
  /* Big. On the poster the sigma carries the whole sheet, and a banner that
     sets it at the same rank as the title throws away the one mark somebody
     recognises from across a room. */
  /* The poster sets 560 / 270 with the mu mu 66 down and 6 across. Held as
     ratios of the sigma rather than of the frame, the lockup is one shape that
     can be scaled to fit: the mu mu is .482 of the sigma, dropped .118 of it
     and nudged .011 across. Straight pixel-for-pixel from the poster the mu mu
     hangs through the rule, because the poster has a 1700px sheet to drop into
     and a 2.4:1 banner has a third of that. */
  .lockup .sig { font-size: ${SIG}px; }
  .lockup .mumu {
    font-size: ${Math.round(SIG * 0.482)}px;
    position: relative;
    top: ${Math.round(SIG * 0.118)}px;
    left: ${Math.round(SIG * 0.011)}px;
  }
  #row h1 { margin-top: 0; font-size: ${Math.round(H * 0.1)}px;
            text-transform: uppercase; letter-spacing: -.015em;
            max-width: ${Math.round(W * 0.5)}px; }
  /* A zero-sized inline-block sits on the baseline of its line, so its top
     edge is that baseline and can be measured. Two of them -- one after the
     sigma, one at the end of the title's last line -- are what the render
     lines up. Doing it by measurement rather than by CSS offsets is the only
     way to be right about it: where a baseline falls inside a line box
     depends on the font's own ascent, which differs between Libertinus and
     Archivo. */
  .bl { display: inline-block; width: 0; height: 0; overflow: hidden; }
  .tagline {
    margin-top: ${Math.round(H * 0.026)}px;
    color: ${ACCENT};
    font-size: ${Math.round(H * 0.042)}px;
    font-weight: 700;
    letter-spacing: .14em;
    text-transform: uppercase;
  }
  .rule {
    margin-top: auto;
    max-width: ${Math.round(W * 0.78)}px;
    height: ${Math.max(2, Math.round(H * 0.005))}px;
    background: ${ACCENT};
    width: 100%;
  }
  /* Stacked, both starting on the left edge the kicker, the title and the
     rule share. Set across from each other the URL had nothing to align to
     and floated in the middle of the frame. */
  .foot {
    max-width: ${Math.round(W * 0.78)}px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: ${Math.round(H * 0.012)}px;
    margin-top: ${Math.round(H * 0.036)}px;
    font-size: ${Math.round(H * 0.046)}px;
    font-weight: 600;
    letter-spacing: .09em;
    text-transform: uppercase;
  }
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
    <div class="kicker">${E.kicker}</div>
    ${E.lockup
      ? `<div id="row">
           <div class="lockup" aria-label="sigma mu mu"><span class="sig">&sigma;<i class="bl" id="bl-sig"></i></span><span class="mumu">&mu;&mu;</span></div>
           <div id="col">
             <h1>${E.title}<i class="bl" id="bl-title"></i></h1>
             <div class="tagline">${E.tagline}</div>
           </div>
         </div>`
      : `<h1>${E.title}</h1>`}
    <div class="rule"></div>
    <div class="foot">
      <span class="where">${E.where}</span>
      <span class="url">${E.url}</span>
    </div>
  </div>
</div></body></html>`;

const chromePath = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.setContent(html, { waitUntil: 'load' });
await page.addScriptTag({ content: await readFile(resolve(ROOT, 'design/network.js'), 'utf8') });

const edges = await page.evaluate(({ W, H, INK, ACCENT, DARK, SEED }) => {
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  const net = window.SMMNet.build({
    w: W, h: H, zones: [], seed: SEED, seeds: [{ x: W * 0.78, y: H * 0.5 }],
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
}, { W, H, INK, ACCENT, DARK, SEED: E.seed });

await page.evaluate(() => document.fonts.ready);
{
  const ok = await page.evaluate(() => document.fonts.check('800 100px Archivo'));
  if (!ok) {
    console.error('  FONT FAULT: Archivo did not load; the type would set in a '
      + 'fallback sans and stop matching the identity');
    process.exit(1);
  }
  console.log('  type set in Archivo');
}
if (E.lockup) {
  const ok = await page.evaluate(() => document.fonts.check('400 100px "Libertinus Math"'));
  if (!ok) {
    console.error('  FONT FAULT: Libertinus Math did not load; the lockup would '
      + 'fall back to a system serif and stop matching the poster');
    process.exit(1);
  }
  console.log('  lockup set in Libertinus Math, as the poster is');
}
await page.waitForFunction(() => {
  const m = document.getElementById('mark');
  return m && m.complete && m.naturalWidth > 0;
});
await page.waitForTimeout(400);
// Sit the title on the sigma's own baseline. The flex row centres boxes, which
// left the type floating at no particular height against a glyph three times
// its size; on the same baseline the two read as one line of a lockup rather
// than as two things that happen to be side by side. The title's last line is
// the one that matches, since that is the line the eye pairs with the sigma.
if (E.lockup) {
  const shift = await page.evaluate(() => {
    const base = el => el.getBoundingClientRect().top;
    const d = base(document.getElementById('bl-sig')) - base(document.getElementById('bl-title'));
    document.getElementById('col').style.transform = `translateY(${d}px)`;
    return d;
  });
  const left = await page.evaluate(() => {
    const base = el => el.getBoundingClientRect().top;
    return base(document.getElementById('bl-sig')) - base(document.getElementById('bl-title'));
  });
  if (Math.abs(left) > 1) {
    console.error(`  BASELINE FAULT: ${left.toFixed(1)}px apart after the shift`);
    process.exitCode = 1;
  } else {
    console.log(`  title dropped ${shift.toFixed(0)}px onto the sigma's baseline`);
  }
}

// Nothing may wrap, overflow, or collide with the mark. A banner is a single
// flat image — a layout fault here is invisible until it is on the page.
const layout = await page.evaluate(() => {
  const r = el => el.getBoundingClientRect();
  const mark = r(document.getElementById('mark'));
  const foot = [...document.querySelectorAll('.foot > span')].map(s => r(s));
  const row = document.getElementById('row');
  const h1 = r(row ? (row.querySelector('h1') || row) : document.querySelector('h1'));
  // The mu mu hangs well below the sigma's baseline, so the lockup's box is
  // the thing that has to clear the rule -- not the row's, which stops at the
  // sigma. Measured off the ink, since a glyph box lies about descenders.
  const lock = document.querySelector('.lockup');
  const rule = r(document.querySelector('.rule'));
  const mumu = lock ? r(lock.querySelector('.mumu')) : null;
  return {
    markInside: mark.right <= innerWidth + 0.5 && mark.top >= -0.5 && mark.bottom <= innerHeight + 0.5,
    footLines: foot.map(f => Math.round(f.height)),
    // Clear means clear: left of the mark, above it, or below it. The
    // footline is below it, which the first two tests alone call a collision.
    footClearsMark: foot.every(f => f.right <= mark.left + 0.5
      || f.bottom <= mark.top + 0.5 || f.top >= mark.bottom - 0.5),
    titleClearsMark: h1.right <= mark.left + 0.5,
    lineHeight: Math.round(parseFloat(getComputedStyle(document.querySelector('.foot')).fontSize) * 1.4),
    lockupClearsRule: !mumu || mumu.bottom <= rule.top + 0.5,
    // Ink to ink, which is the only clearance a reader sees.
    titleGap: mumu ? Math.round(h1.left - mumu.right) : null,
    mumuBottom: mumu ? Math.round(mumu.bottom) : 0,
    ruleTop: Math.round(rule.top),
  };
});
const oneLine = layout.footLines.every(h => h <= layout.lineHeight);
if (!layout.markInside || !oneLine || !layout.footClearsMark || !layout.titleClearsMark
    || !layout.lockupClearsRule) {
  console.error('  LAYOUT FAULT', JSON.stringify(layout));
  console.error('  rects', JSON.stringify(await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const out = { mark: r(document.getElementById('mark')) };
    out.rule = r(document.querySelector('.rule'));
    const row = document.getElementById('row');
    if (row) { out.row = r(row); out.lockup = r(row.querySelector('.lockup')); out.h1 = r(row.querySelector('h1')); }
    document.querySelectorAll('.foot > span').forEach((s, i) => out['foot' + i] = r(s));
    return out;
  })));
  process.exitCode = 1;
} else {
  console.log(`  layout ok: mark inside, footline stacked one line each, `
    + `nothing overlapping the mark${E.lockup
        ? `, lockup clear of the rule, ${layout.titleGap}px of ink between the `
          + `mu mu and the title` : ''}`);
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
