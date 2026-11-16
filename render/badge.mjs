#!/usr/bin/env node
/* The conference badge: a background for Indico's badge designer.
 *
 *   node render/badge.mjs                      # 4x3in landscape, 300 dpi
 *   node render/badge.mjs --theme light
 *
 * Size. A badge insert is 4 x 3 inches almost everywhere a lanyard is handed
 * out, so that is the default: 10.16 x 7.62 cm, which Indico's designer counts
 * at 50 px/cm as 508 x 381 of its own pixels. The file is rendered at 300 dpi
 * (1200 x 900) and Indico scales it down to fit, so it prints sharp rather
 * than at the designer's own coarse grid.
 *
 * Layout. Everything a badge carries belongs to one of two jobs: saying whose
 * meeting it is, and saying who is wearing it. The first is ours and is drawn
 * here -- the mark, the meeting line, the dates, the rule. The second is
 * Indico's and must stay empty, so the middle band is flat ground with the
 * field pulled off it: a name set over a Feynman diagram cannot be read across
 * a room, which is the only thing a badge is for.
 *
 * The field itself comes from render/slide-bg.mjs, veiled and then masked to
 * the top and bottom thirds, so the badge is recognisably from the same family
 * as the slides and the banner without fighting the type.
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const a = process.argv.slice(2);
const num = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : Number(a[i + 1]); };
const str = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };

const THEME = str('theme', 'dark');
const DARK = THEME === 'dark';
const DPI = num('dpi', 300);
const IN_W = num('in', 4), IN_H = num('inh', 3);
const W = Math.round(IN_W * DPI), H = Math.round(IN_H * DPI);
const FIELD = resolve(ROOT, str('field', `out/badge-field-${THEME}.png`));
const OUT = resolve(ROOT, str('out', `out/usmcc-2026-badge-${IN_W}x${IN_H}in-${THEME}.png`));

const PAPER = DARK ? '#141312' : '#f5f0e1';
const INK = DARK ? '#efe9da' : '#201e1d';
const MUTED = DARK ? '#9b948a' : '#605d5d';
const ACCENT = DARK ? '#ff5230' : '#ec3013';
const MARK = DARK
  ? 'https://www.muoncollider.us/resources/USMCCLogo_white.png'
  : 'https://www.muoncollider.us/resources/USMCCLogo_black.png';

const chromePath = process.env.CHROME
  || (await (async () => {
    // Pinned paths go stale every time the image updates; ask the filesystem.
    const { readdir } = await import('node:fs/promises');
    const dirs = (await readdir('/opt/pw-browsers').catch(() => []))
      .filter(d => d.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const p = `/opt/pw-browsers/${d}/${sub}`;
        if (await readFile(p).then(() => true, () => false)) return p;
      }
    }
    return undefined;
  })());

const dataURI = async (path, mime) =>
  `data:${mime};base64,${(await readFile(path)).toString('base64')}`;

// The field, rendered once at the badge's own size and reused on later runs.
const haveField = await readFile(FIELD).then(() => true, () => false);
if (!haveField) {
  console.log(`field: rendering ${FIELD}`);
  const p = spawn(process.execPath, [
    resolve(ROOT, 'render/slide-bg.mjs'), '--theme', THEME, '--w', String(W),
    '--h', String(H), '--veil', '0.42', '--seed', String(num('seed', 7)),
    '--out', FIELD,
  ], { stdio: 'inherit', env: { ...process.env, CHROME: chromePath } });
  const [code] = await once(p, 'exit');
  if (code !== 0) { console.error('field render failed'); process.exit(1); }
}

const fieldURI = await dataURI(FIELD, 'image/png');

const markBuf = await fetch(MARK).then(r => r.arrayBuffer());
const markURI = `data:image/png;base64,${Buffer.from(markBuf).toString('base64')}`;

// Archivo, from the site's own copy, so the badge is set in the same face as
// everything else rather than whatever the renderer happens to have. The faces
// are inlined rather than served: setContent gives the page an about:blank
// origin, from which a relative font URL resolves to nowhere.
const fontDir = resolve(ROOT, 'site/static/fonts');
let fontCss = await readFile(resolve(fontDir, 'fonts.css'), 'utf8');
for (const file of [...new Set([...fontCss.matchAll(/url\('([^']+)'\)/g)].map(m => m[1]))]) {
  const uri = await dataURI(resolve(fontDir, file), 'font/woff2');
  fontCss = fontCss.split(`url('${file}')`).join(`url('${uri}')`);
}

const U = W / 1200;   // one unit: every measure below is written at 1200 wide
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${PAPER}; }
.badge {
  position: relative; width: ${W}px; height: ${H}px;
  background: ${PAPER};
  font-family: Archivo, 'Helvetica Neue', Arial, sans-serif;
  color: ${INK};
}
/* The field, masked away from the middle so the name band is clean ground. */
.field {
  position: absolute; inset: 0;
  background: url('${fieldURI}') center / cover no-repeat;
  -webkit-mask-image: linear-gradient(to bottom,
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 18%, rgba(0,0,0,0) 32%,
      rgba(0,0,0,0) 70%, rgba(0,0,0,1) 86%, rgba(0,0,0,1) 100%);
          mask-image: linear-gradient(to bottom,
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 18%, rgba(0,0,0,0) 32%,
      rgba(0,0,0,0) 70%, rgba(0,0,0,1) 86%, rgba(0,0,0,1) 100%);
}
.head, .foot { position: absolute; left: ${70 * U}px; right: ${70 * U}px; }
.head { top: ${62 * U}px; display: flex; align-items: flex-start; justify-content: space-between; }
.meeting {
  font-size: ${27 * U}px; font-weight: 700; letter-spacing: 0.145em;
  text-transform: uppercase; line-height: 1.32; max-width: ${720 * U}px;
}
.mark { width: ${132 * U}px; height: ${132 * U}px; display: block; flex: 0 0 auto; }
.rule { position: absolute; left: ${70 * U}px; right: ${70 * U}px; height: ${3 * U}px;
        background: ${ACCENT}; }
.rule.top { top: ${236 * U}px; }
.rule.bottom { bottom: ${124 * U}px; }
.foot { bottom: ${62 * U}px; display: flex; align-items: baseline; justify-content: space-between; }
.when { font-size: ${26 * U}px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.where { font-size: ${20 * U}px; font-weight: 500; letter-spacing: 0.04em; color: ${MUTED}; }
</style></head><body>
<div class="badge">
  <div class="field"></div>
  <div class="head">
    <div class="meeting">US Muon Collider<br>Collaboration Meeting</div>
    <img class="mark" src="${markURI}" alt="">
  </div>
  <div class="rule top"></div>
  <div class="rule bottom"></div>
  <div class="foot">
    <div class="when">Stanford &middot; Dec 13&ndash;16, 2026</div>
    <div class="where">indico.muoncollider.us/e/usmcc2026</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

// The badge is set in Archivo or it is not shipped: a fallback face would put
// the tracking and the line breaks somewhere else entirely.
const usedArchivo = await page.evaluate(() => {
  const el = document.querySelector('.meeting');
  const s = getComputedStyle(el);
  // With no weight, check() asks after the 400 face, which this badge never
  // uses and never loads -- so ask about the weight actually set.
  return document.fonts.check(`${s.fontWeight} ${s.fontSize} Archivo`);
});
if (!usedArchivo) { console.error('Archivo did not load; refusing to write'); process.exit(1); }

await mkdir(resolve(ROOT, 'out'), { recursive: true });
await writeFile(OUT, await page.locator('.badge').screenshot());
await browser.close();

const px = v => Math.round(v * (IN_W * 2.54 * 50) / W);   // render px -> designer px
console.log(`${OUT}  ${W}x${H} (${IN_W}x${IN_H}in at ${DPI} dpi)`);
console.log(`template: ${(IN_W * 2.54).toFixed(2)} x ${(IN_H * 2.54).toFixed(2)} cm`
          + `  =  ${px(W)} x ${px(H)} designer px at Indico's 50 px/cm`);
console.log(`clear band for the name: y ${px(270 * U)} to ${px(620 * U)} designer px`);
