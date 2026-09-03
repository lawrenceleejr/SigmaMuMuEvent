#!/usr/bin/env node
/* Render a slide background: a VBF di-Higgs diagram at the centre, its legs
 * growing outward into the Feynman field.
 *
 *   node render/slide-bg.mjs                        # dark, 1920x1080
 *   node render/slide-bg.mjs --theme light
 *   node render/slide-bg.mjs --w 3840 --h 2160
 *   node render/slide-bg.mjs --seed 12 --out out/slide.png
 *
 * The centre is drawn, not generated: two quarks come in from the left, each
 * radiates a weak boson, the two bosons fuse to a Higgs, and that Higgs splits
 * into the pair. It is the process the meeting exists to argue for, so it is
 * the one thing on the slide that is placed by hand.
 *
 * Everything outward of it is grown from its six external legs, one legal
 * Standard Model vertex at a time — a fermion carries on and radiates a boson
 * (ffV) or a Higgs (ffh), a boson splits (VVV) or turns into a Higgs (hVV), a
 * Higgs splits (hhh) or goes back to bosons (hVV). Nothing is placed that
 * would cross what is already there, so the whole structure stays planar the
 * way the poster's mesh does.
 *
 * The generated mesh from design/network.js then fills what is left, kept off
 * the drawn structure by a clearance disc on every one of its segments, and
 * knocked back in tone so the diagram reads as the subject and the mesh as
 * the ground. Every vertex in both is audited against the same table
 * render/audit_vertices.mjs uses; the render fails if one is illegal.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const a = process.argv.slice(2);
const num = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : Number(a[i + 1]); };
const str = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };

const THEME = str('theme', 'dark');
const DARK = THEME === 'dark';
const W = num('w', 1920), H = num('h', 1080);
const SEED = num('seed', 2026);
const SEP = num('sep', 0.42);      // how close two pieces of line may come
const GENS = num('gens', 10);      // how many times a leg may branch on its way out
// A flat wash of the ground over the finished field. 0 leaves the diagram at
// full strength; raise it for a slide that has to carry a lot of type.
const VEIL = num('veil', 0);
const OUT = resolve(ROOT, str('out', `out/slide-bg-${THEME}-${W}x${H}.png`));

const PAPER = DARK ? '#141312' : '#f5f0e1';
const INK = DARK ? '#efe9da' : '#201e1d';
const ACCENT = DARK ? '#ff5230' : '#ec3013';

// One unit. Every distance below is in these, so the layout holds at any size.
// The diagram wants to be a feature in the middle of a field, not the whole
// slide, so it is sized off the frame height and kept to the central third.
const U = num('unit', H / 17);
// Line weight follows the output size, not the unit: a wider render gets
// proportionally heavier lines so it reads the same projected.
const REF = num('ref', W / 1920);
const CORE_S = num('coreScale', 2.9 * REF);   // weight of the drawn diagram
const MESH_S = num('meshScale', 2.1 * REF);   // and of the field behind it
const CX = W / 2, CY = H / 2;

/* The diagram, the growth out of it and the mesh keep-out all live in
   design/vbf.js, which the presenter page at site/ loads as well — one copy,
   so the still and the animated version cannot drift apart. */
const chromePath = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${PAPER}; }
</style></head><body><canvas id="c" width="${W}" height="${H}"></canvas></body></html>`);
await page.addScriptTag({ content: await readFile(resolve(ROOT, 'design/network.js'), 'utf8') });
await page.addScriptTag({ content: await readFile(resolve(ROOT, 'design/vbf.js'), 'utf8') });

const stats = await page.evaluate(({ W, H, INK, ACCENT, PAPER, SEED, CORE_S, MESH_S, U,
                                     CX, CY, SEP, GENS, VEIL }) => {
  const N = window.SMMNet;
  const drawnNet = window.SMMVBF.build({ w: W, h: H, unit: U, seed: SEED,
    coreScale: CORE_S, meshScale: MESH_S, sep: SEP, gens: GENS });
  const CORE_EDGES = drawnNet.coreEdges;
  const zones = window.SMMVBF.zones(drawnNet, U * 0.3);
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const mesh = N.build({
    w: W, h: H, zones, seed: SEED, seeds: [{ x: CX, y: CY }],
    // build() multiplies spacing by scaleAt to get the point separation, and
    // scaleAt is also the line weight — so the separation is asked for in
    // units of the frame and divided back out, or a 4K render would come out
    // twice as coarse as a 1080 one instead of the same picture larger.
    spacing: U * 0.93 / MESH_S, keep: 0.72, speed: 120, darts: 260000,
    pad: -U * 0.5, clearance: 0, clearanceAt: () => 0, scaleAt: () => MESH_S,
    cornerR: 0, maxLegs: 4, minSep: 0.42, minSepHard: 0.25, minComponent: 3,
    fermionShare: 0.5, higgsShare: 0.18, splitQuads: false,
    higgsPure: 7, higgsQuartics: 2,
  });

  // The mesh is the ground: it sits back, and further back still toward the
  // frame edge, so the drawn diagram keeps the middle.
  for (const e of mesh.edges) {
    const p = mesh.verts[e.a], q = mesh.verts[e.b];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const d = Math.hypot((mx - CX) / (W / 2), (my - CY) / (H / 2));
    const tone = 0.5 * (1 - 0.4 * Math.min(1, d));
    N.drawEdge(ctx, mesh, e, 1, { accent: ACCENT, ink: INK, tone });
  }
  // Then the grown legs, then the core over them, each at full strength.
  for (let i = drawnNet.edges.length - 1; i >= CORE_EDGES; i--) {
    const e = drawnNet.edges[i];
    const p = drawnNet.verts[e.a], q = drawnNet.verts[e.b];
    const d = Math.hypot(((p[0] + q[0]) / 2 - CX) / (W / 2), ((p[1] + q[1]) / 2 - CY) / (H / 2));
    N.drawEdge(ctx, drawnNet, e, 1,
               { accent: ACCENT, ink: INK, tone: 0.88 * (1 - 0.34 * Math.min(1, d)) });
  }
  for (let i = 0; i < CORE_EDGES; i++) {
    N.drawEdge(ctx, drawnNet, drawnNet.edges[i], 1, { accent: ACCENT, ink: INK, tone: 1 });
  }

  if (VEIL > 0) {
    ctx.fillStyle = N.rgba(PAPER, VEIL);
    ctx.fillRect(0, 0, W, H);
  }

  // legality of every vertex in both graphs
  const audit = (net) => {
    const legs = net.verts.map(() => []);
    net.edges.forEach(e => { legs[e.a].push(e.type); legs[e.b].push(e.type); });
    const tally = {};
    legs.forEach((l, v) => {
      if (l.length < 2) return;                       // an external line, not a vertex
      // Nor is a kink: where a leg of the diagram had to bend to get past
      // something, one propagator carries straight through and no interaction
      // happens. Two legs, both the same line — nothing to classify.
      if (net.bend && net.bend[v]) return;
      const k = l.slice().sort().join('');
      tally[k] = (tally[k] || 0) + 1;
    });
    return tally;
  };
  return { mesh: audit(mesh), drawn: audit(drawnNet),
           meshEdges: mesh.edges.length, meshVerts: mesh.verts.length,
           drawnEdges: drawnNet.edges.length, coreEdges: CORE_EDGES };
}, { W, H, INK, ACCENT, PAPER, SEED, CORE_S, MESH_S, U, CX, CY, SEP, GENS, VEIL });

/* ---- audit -------------------------------------------------------------- */
const LEGAL = new Set(['bff', 'bbff', 'ffh', 'bbb', 'bbbb', 'bbh', 'bbhh', 'hhh', 'hhhh']);
let illegal = 0;
for (const [name, tally] of [['drawn diagram', stats.drawn], ['mesh', stats.mesh]]) {
  const rows = Object.entries(tally).sort((x, y) => y[1] - x[1]);
  const total = rows.reduce((n, r) => n + r[1], 0);
  const bad = rows.filter(r => !LEGAL.has(r[0]));
  illegal += bad.reduce((n, r) => n + r[1], 0);
  console.log(`  ${name}: ${total} vertices — `
    + rows.map(r => `${r[0]} ${r[1]}`).join(', ')
    + (bad.length ? `  ILLEGAL: ${bad.map(r => r[0]).join(', ')}` : ''));
}
if (illegal) {
  console.error(`  VERTEX FAULT: ${illegal} illegal vertices`);
  process.exitCode = 1;
}

await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();

await new Promise((ok, no) => {
  const p = spawn('python3', ['-c', `
from PIL import Image
import os
p = ${JSON.stringify(OUT)}
before = os.path.getsize(p) / 1024
Image.open(p).convert('RGB').save(p, optimize=True)
print('  %d KB -> %d KB' % (before, os.path.getsize(p) / 1024))
`], { stdio: 'inherit' });
  p.on('exit', c => c === 0 ? ok() : no(new Error('optimise failed: ' + c)));
});
console.log(`wrote ${OUT}`);
console.log(`  ${W}x${H} ${THEME}, core ${stats.coreEdges} lines + `
  + `${stats.drawnEdges - stats.coreEdges} grown, ${stats.meshEdges} mesh lines`);
