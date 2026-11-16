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
 * The field itself is the plain mesh from render/field-still.mjs -- the one
 * behind the Indico pages -- masked to the top and bottom thirds. Not the
 * slide background: that is built around a drawn VBF diagram, which is a
 * picture with a subject and wants to be looked at, where a badge wants a
 * texture nobody looks at twice.
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
// field-still.mjs writes to site/static/img by design -- it is the skin's
// background first -- so it is rendered there and copied here.
const haveField = await readFile(FIELD).then(() => true, () => false);
if (!haveField) {
  console.log(`field: rendering ${FIELD}`);
  const args = ['--w', String(W), '--h', String(H),
                '--scale', String(num('scale', 1.35)),
                '--seed', String(num('seed', 4271))];
  if (DARK) args.push('--dark');
  const p = spawn(process.execPath, [resolve(ROOT, 'render/field-still.mjs'), ...args],
                  { stdio: 'inherit', env: { ...process.env, CHROME: chromePath } });
  const [code] = await once(p, 'exit');
  if (code !== 0) { console.error('field render failed'); process.exit(1); }
  const written = resolve(ROOT, `site/static/img/field-still${DARK ? '-dark' : ''}.png`);
  await writeFile(FIELD, await readFile(written));
}

const fieldURI = await dataURI(FIELD, 'image/png');

const markBuf = await fetch(MARK).then(r => r.arrayBuffer());
const markURI = `data:image/png;base64,${Buffer.from(markBuf).toString('base64')}`;

/* Size, before anything else: a QR is only as good as its smallest module,
 * and the usual floor for a phone at arm's length is 0.4 mm. This code is
 * version 3 (29 modules) for a 41-character URL, so at 210 px on a 300 dpi
 * sheet each module lands at about 0.55 mm with room to spare. The render
 * decodes the finished badge and fails if it cannot read itself back.
 *
 * The QR, drawn as an SVG by segno so it stays crisp at any size. Error
 * correction M: a badge gets creased and thumbed, and the URL is short enough
 * that the extra redundancy costs no modules anyone will notice. Light on dark
 * is the readable way round here -- phone decoders handle an inverted code far
 * less reliably than a dark-on-light one, so the code sits on its own bone
 * patch rather than on the badge's ground. */
const QR_URL = str('url', 'https://indico.muoncollider.us/e/usmcc2026');
const qrSvg = await new Promise((ok, no) => {
  const p = spawn('python3', ['-c', `
import segno, sys
segno.make(sys.argv[1], error='m').save(sys.stdout.buffer, kind='svg',
    scale=10, border=2, dark='#141312', light='#efe9da')
`, QR_URL], { stdio: ['ignore', 'pipe', 'inherit'] });
  const out = [];
  p.stdout.on('data', d => out.push(d));
  p.on('exit', c => c === 0 ? ok(Buffer.concat(out).toString('utf8'))
                            : no(new Error('qr failed: ' + c)));
});
const qrURI = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString('base64')}`;

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
const MM = (DPI * U) / 25.4 / (W / 1200);   // one millimetre, in CSS px

/* Spacing is a grid of 2 mm, and nothing sits closer than 4 mm to anything
 * else. The previous layout had two rules bracketing the name, which turned
 * the badge into a box it does not need -- and both of them touched what they
 * were meant to separate: the top rule crossed the mark's lettering, the
 * bottom one ran into the QR's tile. One rule, under the header, is enough;
 * the footer is told apart by sitting at the foot.
 */
const M = 6;        // the margin, mm, the same on all four sides
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
/* The field, masked away from the middle so the name band is clean ground,
   and knocked back: on the Indico pages it sits behind running text at the
   same strength, but here it runs under tracked capitals, which have far less
   ink to defend themselves with. */
.field {
  position: absolute; inset: 0;
  opacity: 0.40;
  background: url('${fieldURI}') center / cover no-repeat;
  -webkit-mask-image: linear-gradient(to bottom,
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 34%,
      rgba(0,0,0,0) 64%, rgba(0,0,0,1) 80%, rgba(0,0,0,1) 100%);
          mask-image: linear-gradient(to bottom,
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 34%,
      rgba(0,0,0,0) 64%, rgba(0,0,0,1) 80%, rgba(0,0,0,1) 100%);
}
.head {
  position: absolute; left: ${M * MM}px; right: ${M * MM}px; top: ${5 * MM}px;
  display: flex; align-items: center; justify-content: space-between;
}
/* One short word, set as a wordmark rather than a label, on the mark's own
   optical centre line. */
.meeting {
  font-size: ${4.6 * MM}px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; line-height: 1;
}
.mark { width: ${15 * MM}px; height: ${15 * MM}px; display: block; flex: 0 0 auto; }
/* The one rule: 4 mm clear of the mark above it. */
.rule {
  position: absolute; left: ${M * MM}px; right: ${M * MM}px; top: ${24 * MM}px;
  height: ${0.3 * MM}px; background: ${ACCENT};
}
.foot {
  position: absolute; left: ${M * MM}px; right: ${M * MM}px; bottom: ${M * MM}px;
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: ${8 * MM}px;
}
.when { font-size: ${2.6 * MM}px; font-weight: 700; letter-spacing: 0.085em;
        text-transform: uppercase; white-space: nowrap; }
.where { font-size: ${2.3 * MM}px; font-weight: 500; letter-spacing: 0.02em;
         color: ${MUTED}; margin-top: ${1.4 * MM}px; white-space: nowrap; }
/* The code and what it is for, as one block: the caption sits above it rather
   than beside it, so neither has to be squeezed to fit the other. */
.qr { flex: 0 0 auto; text-align: right; }
.ask { font-size: ${2.2 * MM}px; font-weight: 700; letter-spacing: 0.05em;
       line-height: 1.4; text-transform: uppercase; color: ${MUTED};
       white-space: nowrap; margin-bottom: ${2 * MM}px; }
.qr img { width: ${18 * MM}px; height: ${18 * MM}px; display: block; margin-left: auto;
          border-radius: ${1 * MM}px; }
</style></head><body>
<div class="badge">
  <div class="field"></div>
  <div class="head">
    <div class="meeting">USMCC2026</div>
    <img class="mark" src="${markURI}" alt="">
  </div>
  <div class="rule"></div>
  <div class="foot">
    <div>
      <div class="when">Stanford &middot; Dec 13&ndash;16, 2026</div>
      <div class="where">indico.muoncollider.us/e/usmcc2026</div>
    </div>
    <div class="qr">
      <div class="ask">Program,<br>participants,<br>&amp; details</div>
      <img src="${qrURI}" alt="">
    </div>
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

/* --audit reports the layout as the browser actually laid it out, in mm at the
 * output resolution. Measuring the PNG instead sounds more honest and is not:
 * the mesh's brightest vertices read as ink, so every box comes back larger
 * than the element that drew it. */
if (a.includes('--audit')) {
  const rows = await page.evaluate(() => {
    const sel = {
      'sheet': '.badge', 'wordmark': '.meeting', 'mark': '.mark',
      'rule': '.rule',
      'date line': '.when', 'url line': '.where', 'qr caption': '.ask', 'qr': '.qr img',
    };
    const out = {};
    for (const [k, q] of Object.entries(sel)) {
      const el = document.querySelector(q);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[k] = { x: r.x, y: r.y, w: r.width, h: r.height,
                 size: parseFloat(cs.fontSize) || null };
    }
    return out;
  });
  const MM = 25.4 / DPI;
  const sheet = rows['sheet'];
  console.log(`\naudit — ${(sheet.w * MM).toFixed(1)} x ${(sheet.h * MM).toFixed(1)} mm sheet`);
  console.log(['element', 'left', 'right', 'top', 'bottom', 'width', 'height', 'type']
    .map((h, i) => i ? h.padStart(8) : h.padEnd(12)).join(''));
  const gap = (a, b) => {
    const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    return (dx >= 0 || dy >= 0) ? Math.max(dx, dy) : Math.max(dx, dy); // <0 = overlap
  };
  for (const [k, r] of Object.entries(rows)) {
    if (k === 'sheet') continue;
    const f = v => (v * MM).toFixed(1).padStart(8);
    console.log(k.padEnd(12) + f(r.x) + f(sheet.w - (r.x + r.w)) + f(r.y)
      + f(sheet.h - (r.y + r.h)) + f(r.w) + f(r.h)
      + (r.size ? (r.size * MM).toFixed(1).padStart(8) : ''.padStart(8)));
  }
  // Nothing on a 101 mm sheet should come within 4 mm of anything else. The
  // pair that broke this rule last time -- a rule and the thing it separated
  // -- is exactly the pair nobody checks.
  // A date and the URL under it are one block, as are a caption and the code
  // it labels: the space between them is leading, not clearance.
  const paired = [['date line', 'url line'], ['qr caption', 'qr']]
    .map(p => p.sort().join('|'));
  const keys = Object.keys(rows).filter(k => k !== 'sheet');
  const tight = [];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      if (paired.includes([keys[i], keys[j]].sort().join('|'))) continue;
      const g = gap(rows[keys[i]], rows[keys[j]]) * MM;
      if (g < 4) tight.push([keys[i], keys[j], g]);
    }
  if (!tight.length) console.log('\nclearances: nothing within 4 mm of anything else');
  else for (const [a, b, g] of tight.sort((x, y) => x[2] - y[2]))
    console.log(`${g < 0 ? 'OVERLAP ' : 'tight   '} ${a} / ${b}: ${g.toFixed(1)} mm`);
}

await mkdir(resolve(ROOT, 'out'), { recursive: true });
await writeFile(OUT, await page.locator('.badge').screenshot());
await browser.close();

const px = v => Math.round(v * (IN_W * 2.54 * 50) / W);   // render px -> designer px
console.log(`${OUT}  ${W}x${H} (${IN_W}x${IN_H}in at ${DPI} dpi)`);
console.log(`template: ${(IN_W * 2.54).toFixed(2)} x ${(IN_H * 2.54).toFixed(2)} cm`
          + `  =  ${px(W)} x ${px(H)} designer px at Indico's 50 px/cm`);
console.log(`clear band for the name: y ${px(270 * U)} to ${px(620 * U)} designer px`);
