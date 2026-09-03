#!/usr/bin/env node
/* Render the Feynman field as an SVG that draws itself.
 *
 *   node render/field-svg.mjs                     # light -> site/static/img/field-live.svg
 *   node render/field-svg.mjs --theme dark        # dark  -> field-live-dark.svg
 *   node render/field-svg.mjs --w 1800 --spacing 30 --seconds 26
 *
 * Why an SVG: Indico only lets you upload a stylesheet, so the canvas that
 * animates the website cannot run there. An SVG referenced from CSS as a
 * background-image is loaded in "secure animated mode" — no scripts, but its
 * own declarative animation does play. So the motion is declared inside the
 * file.
 *
 * Why SMIL rather than CSS keyframes: Safari does not run CSS animations
 * inside an SVG that is used as an image. It renders the first frame and
 * stops, which is why this field was alive in Chrome and on iOS and dead on a
 * Mac desktop. SMIL is the one declarative animation every current engine runs
 * in an image context, so that is what this emits.
 *
 * Each line carries the growth order build() already computes, turned into a
 * negative begin time. Because those are spread across one loop the field is
 * always mid-life somewhere rather than restarting in unison.
 *
 * The animation is declared once per timing group rather than once per line:
 * stroke-dashoffset is an inherited property, so a <g> carrying the animation
 * drives every line inside it, and group opacity multiplies through for the
 * fade. 614 lines become a few dozen groups, which is what keeps the file from
 * doubling in size when the keyframes stop being shared through a stylesheet.
 *
 * Solid lines and boson waves draw themselves with stroke-dashoffset. Scalars
 * are dashed, and their dasharray is already spoken for, so they fade instead.
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const a = process.argv.slice(2);
const num = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : Number(a[i + 1]); };
const str = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };

const THEME = str('theme', 'light');
const DARK = THEME === 'dark';
const W = num('w', 1800), H = num('h', 1350);
const SCALE = num('scale', 2.4), SPACING = num('spacing', 30);
const SEED = num('seed', 2026), SECONDS = num('seconds', 26);
const OUT = resolve(ROOT, `site/static/img/field-live${DARK ? '-dark' : ''}.svg`);

const PAPER = DARK ? '#141312' : '#f5f0e1';
const INK = DARK ? '#efe9da' : '#201e1d';
const ACCENT = DARK ? '#ff5230' : '#ec3013';

const chromePath = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage();
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.setContent('<div></div>');
await page.addScriptTag({ content: await readFile(resolve(ROOT, 'design/network.js'), 'utf8') });

// Pull the geometry out of the shared generator, in the units it draws in.
const net = await page.evaluate(({ W, H, SCALE, SPACING, SEED }) => {
  const N = window.SMMNet;
  const net = N.build({
    w: W, h: H, zones: [], seed: SEED, seeds: [{ x: W * 0.5, y: H * 0.5 }],
    spacing: SPACING, keep: 0.72, speed: 120, darts: 120000,
    pad: -SCALE * 26, clearance: 0, clearanceAt: () => 0, scaleAt: () => SCALE,
    cornerR: 0, maxLegs: 4, minSep: 0.42, minSepHard: 0.25, minComponent: 4,
    fermionShare: 0.5, higgsShare: 0.18, splitQuads: false,
    higgsPure: 6, higgsQuartics: 2,
  });
  // pathPoints is private, so redraw each edge through a stub context that
  // records the polyline instead of painting it.
  const edges = net.edges.map(e => {
    const pts = [];
    const stub = {
      lineCap: '', lineJoin: '', strokeStyle: '', fillStyle: '', lineWidth: 0,
      setLineDash() {}, beginPath() {}, stroke() {}, fill() {}, arc() {},
      moveTo(x, y) { pts.push([x, y]); },
      lineTo(x, y) { pts.push([x, y]); },
    };
    N.drawEdge(stub, net, e, 1, { accent: '#000' });
    return { type: e.type, s: e.s || 1, t0: e.t0, xa: !!e.xa, xb: !!e.xb, pts };
  });
  return { verts: net.verts, edges, duration: net.duration };
}, { W, H, SCALE, SPACING, SEED });
await browser.close();

const r2 = n => Math.round(n * 10) / 10;
const len = pts => {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return t;
};

const maxT = net.edges.reduce((m, e) => Math.max(m, e.t0 || 0), 0) || 1;

/* The growth curve.
 *
 * The website grows each line on grow = 1 - (1 - t)^5.5: fast out of the
 * vertex, then a long decay. A CSS animation between two keyframes is linear,
 * and animation-timing-function only offers cubic-beziers, which cannot hold
 * an initial slope of 5.5 without distorting the tail. So the curve is traced
 * as keyframes instead — sampled where it actually bends, which is almost all
 * at the start, and left to interpolate linearly in between.
 *
 * The value animated is stroke-dashoffset, the part of the line still hidden,
 * so it follows (1 - u)^5.5 down to zero. pathLength="1" on every drawn path
 * means these are plain numbers rather than fractions of each line's length.
 */
const GROW_EXP = 5.5;             // the exponent the poster and the site use
const GROW_END = 26;              // % of the loop the growth occupies
const TOL = 0.002;                // keyframes within 0.2% of a line's length
const curve = u => Math.pow(1 - u, GROW_EXP);

let us = [0, 1];
for (let pass = 0; pass < 14; pass++) {
  const next = [us[0]];
  let split = false;
  for (let i = 1; i < us.length; i++) {
    const a = us[i - 1], b = us[i], m = (a + b) / 2;
    if (Math.abs((curve(a) + curve(b)) / 2 - curve(m)) > TOL) { next.push(m); split = true; }
    next.push(b);
  }
  us = next;
  if (!split) break;
}
// What the browser will actually draw, against the curve it is tracing.
let worst = 0;
for (let i = 0; i <= 2000; i++) {
  const u = i / 2000;
  let j = 1;
  while (j < us.length - 1 && us[j] < u) j++;
  const a = us[j - 1], b = us[j];
  const lerp = curve(a) + (curve(b) - curve(a)) * ((u - a) / (b - a));
  worst = Math.max(worst, Math.abs(lerp - curve(u)));
}
/* The same stops, as the two parallel lists SMIL wants: keyTimes are
   fractions of the loop and must run 0 to 1, values are what the property
   takes at each. The growth occupies the first GROW_END% and then the line
   holds at 0 until the fade at the end. */
const growTimes = us.map(u => +(u * GROW_END / 100).toFixed(5));
const growValues = us.map(u => +curve(u).toFixed(4));
growTimes.push(1);              // holds at zero for the rest of the loop
growValues.push(0);
const DASH_TIMES = growTimes.join(';');
const DASH_VALUES = growValues.join(';');

// Opacity is its own animation: up over the first 3% so a line does not blink
// into existence at full strength, held, then out at the end. On a group this
// multiplies through to every line inside it.
const FADE_TIMES = '0;0.03;0.82;1';
const FADE_VALUES = '0;1;1;0';
// The scalars and the vertex marks only fade -- their dasharray is spoken for.
const GLOW_TIMES = '0;0.04;0.82;1';
const GLOW_VALUES = '0;1;1;0';

/* One animation per timing group instead of one per line. The delays build()
   produces are continuous, so they are quantised into BUCKETS steps across the
   loop: at 26 seconds and 64 buckets that is 0.4s of granularity, which is
   finer than an eye tracking 600 lines can resolve, and it turns 945
   animation declarations into 128. */
/* 40 measured out as the balance: cost falls off with fewer groups (64
   buckets ran at 31 fps in a software rasteriser, 24 at 41), while a coarser
   stagger starts to clump -- at 24 buckets some twenty-five lines begin
   drawing in the same instant. 40 is 0.7s of granularity and about fifteen
   lines to a group. */
const BUCKETS = num('buckets', 40);
const bucketOf = t0 => Math.min(BUCKETS - 1, Math.floor((t0 / maxT) * BUCKETS));
const beginOf = b => -r2(((b + 0.5) / BUCKETS) * SECONDS);

// The node dots and the x marks that end a line in the vacuum. Each takes the
// timing of the earliest line that touches it, minus a lead, so the vertex is
// already there before anything grows out of it — the same rule the website
// follows.
const marks = new Map();
for (const e of net.edges) {
  const first = e.pts[0], last = e.pts[e.pts.length - 1];
  for (const [p, isX] of [[first, e.xa], [last, e.xb]]) {
    const k = r2(p[0]) + ',' + r2(p[1]);
    const prev = marks.get(k);
    if (!prev) marks.set(k, { x: p[0], y: p[1], isX, s: e.s, t0: e.t0 });
    else if (e.t0 < prev.t0) { prev.t0 = e.t0; prev.isX = isX; }
  }
}

/* Three sets of shapes, bucketed by when they come to life: the lines that
   draw themselves, and the scalars and vertex marks that only fade. */
const drawGroups = Array.from({ length: BUCKETS }, () => '');
const glowGroups = Array.from({ length: BUCKETS }, () => '');
let drawn = 0, faded = 0;
for (const e of net.edges) {
  const d = 'M' + e.pts.map(p => r2(p[0]) + ' ' + r2(p[1])).join('L');
  const lwf = 0.8 + 0.3 * e.s;
  const b = bucketOf(e.t0 || 0);
  if (e.type === 'h') {
    const dash = r2(6.5 * e.s);
    glowGroups[b] += `<path class="s" d="${d}" stroke-width="${r2(1.35 * lwf)}"`
                   + ` stroke-dasharray="${dash} ${dash}"/>`;
    faded++;
  } else {
    const cls = e.type === 'b' ? 'b' : 'f';
    // pathLength normalises every line to 1 unit, so one set of dashoffset
    // values serves a 20px edge and a 200px one, which is what lets the
    // animation live on the group instead of on each path.
    drawGroups[b] += `<path class="${cls}" d="${d}"`
                   + ` stroke-width="${r2((e.type === 'b' ? 1.15 : 1.35) * lwf)}"`
                   + ` pathLength="1" stroke-dasharray="1"/>`;
    drawn++;
  }
}
const LEAD = SECONDS * 0.012;   // the vertex lands a beat before its lines
for (const m of marks.values()) {
  const rr = r2(1.8 * (0.72 + 0.5 * m.s)), q = r2(3.4 * (0.72 + 0.5 * m.s));
  const x = r2(m.x), y = r2(m.y);
  // a beat early, which is one bucket back
  const b = Math.max(0, bucketOf(m.t0 || 0) - Math.round((LEAD / SECONDS) * BUCKETS));
  glowGroups[b] += m.isX
    ? `<path class="x" d="M${r2(x - q)} ${r2(y - q)}L${r2(x + q)} ${r2(y + q)}M${r2(x + q)} ${r2(y - q)}L${r2(x - q)} ${r2(y + q)}" stroke-width="${r2(1.3 * (0.8 + 0.3 * m.s))}"/>`
    : `<circle class="n" cx="${x}" cy="${y}" r="${rr}"/>`;
}

// stroke-dashoffset inherits, and group opacity multiplies through, so one
// pair of <animate> elements on the group drives everything inside it.
const anim = (attr, times, values, begin) =>
  `<animate attributeName="${attr}" dur="${SECONDS}s" repeatCount="indefinite"`
  + ` calcMode="linear" keyTimes="${times}" values="${values}" begin="${begin}s"/>`;

let body = '', groups = 0;
for (let b = 0; b < BUCKETS; b++) {
  const begin = beginOf(b);
  if (drawGroups[b]) {
    body += `<g>${anim('stroke-dashoffset', DASH_TIMES, DASH_VALUES, begin)}`
          + `${anim('opacity', FADE_TIMES, FADE_VALUES, begin)}`
          + `${drawGroups[b]}</g>\n`;
    groups++;
  }
  if (glowGroups[b]) {
    body += `<g>${anim('opacity', GLOW_TIMES, GLOW_VALUES, begin)}`
          + `${glowGroups[b]}</g>\n`;
    groups++;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<style>
  /* Palette only. The motion is in the SMIL animate elements, because Safari
     does not run CSS animation inside an image, and a CSS rule here would in
     any case take precedence over SMIL and mask it. Reduced motion is handled
     by the consumer -- indico/sigmamumu-indico.css swaps this file for the
     flat field-still.png under a prefers-reduced-motion query -- since nothing
     inside an SVG can switch SMIL off.
     No angle brackets in here, either: this is character data in an XML
     document, so a bare less-than is a parse error and takes the whole file
     down. It did, once. */
  .bg { fill: ${PAPER}; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .f { stroke: ${INK}; stroke-opacity: .88; }
  .b { stroke: ${INK}; stroke-opacity: .72; }
  .s { stroke: ${ACCENT}; stroke-opacity: .85; }
  .n { fill: ${INK}; fill-opacity: .92; }
  .x { stroke: ${INK}; stroke-opacity: .88; fill: none; }
</style>
<rect class="bg" width="${W}" height="${H}"/>
${body}
</svg>`;

await writeFile(OUT, svg);
console.log(`wrote ${OUT}`);
console.log(`  ${W}x${H} ${THEME}, ${net.edges.length} edges (${drawn} drawn, ${faded} faded), `
  + `${marks.size} vertex marks, ${(svg.length / 1024).toFixed(0)} KB, ${SECONDS}s loop`);
console.log(`  growth 1-(1-t)^${GROW_EXP} over ${GROW_END}% of the loop, traced by ${us.length} `
  + `SMIL values, worst deviation ${(worst * 100).toFixed(2)}% of a line`);
console.log(`  ${groups} timing groups over ${BUCKETS} buckets `
  + `(${r2(SECONDS / BUCKETS)}s of stagger granularity)`);
if (worst > TOL * 1.5) {
  console.error('  CURVE FAULT: keyframes do not follow the growth curve');
  process.exitCode = 1;
}
