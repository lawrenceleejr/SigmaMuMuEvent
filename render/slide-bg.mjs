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

/* ---- the core: VBF, then h -> hh ---------------------------------------- */
// Time runs left to right. A and B are the quark radiation vertices, C is the
// fusion, D is the Higgs self-coupling. Laid out so no leg crosses another:
// the outgoing quarks open wider than the Higgses they enclose.
const verts = [];
const edges = [];
const V = (x, y) => { verts.push([CX + x * U, CY + y * U]); return verts.length - 1; };
const E = (i, j, type, s) => {
  const A = verts[i], B = verts[j];
  edges.push({ a: i, b: j, type, s: s == null ? CORE_S : s,
               len: Math.hypot(B[0] - A[0], B[1] - A[1]), xa: false, xb: false });
  return edges.length - 1;
};

const A = V(-1.7, -1.45), B = V(-1.7, 1.45), C = V(0.2, 0), D = V(2.0, 0);
const f1in = V(-5.2, -2.35), f1out = V(5.3, -3.0);
const f2in = V(-5.2, 2.35), f2out = V(5.3, 3.0);
const h1 = V(5.0, -1.35), h2 = V(5.0, 1.35);

E(f1in, A, 'f'); E(A, f1out, 'f');          // the quark that carries on
E(f2in, B, 'f'); E(B, f2out, 'f');
E(A, C, 'b'); E(B, C, 'b');                 // the two weak bosons
E(C, D, 'h');                               // the Higgs they fuse to
E(D, h1, 'h'); E(D, h2, 'h');               // and the pair it splits into

const CORE_EDGES = edges.length;
// The six ends the field grows out of, each with the direction it arrived on
// and the edge it arrived by — which end of that edge carries the vacuum mark
// until something grows out of it.
const endMark = new Map();      // vertex -> [edge index, 'xa' | 'xb']
const tips = [f1in, f1out, f2in, f2out, h1, h2].map(i => {
  const ei = edges.findIndex(e => e.a === i || e.b === i);
  const e = edges[ei];
  const other = verts[e.a === i ? e.b : e.a];
  endMark.set(i, [ei, e.a === i ? 'xa' : 'xb']);
  edges[ei][e.a === i ? 'xa' : 'xb'] = true;
  return { v: i, type: e.type, dir: Math.atan2(verts[i][1] - other[1], verts[i][0] - other[0]) };
});

/* ---- growing the legs out ----------------------------------------------- */
// Which legal vertex a leg of each type can turn into, as the two legs that
// leave it. Keys are what render/audit_vertices.mjs calls legal.
const RULES = {
  f: [['f', 'b'], ['f', 'b'], ['f', 'b'], ['f', 'h']],   // ffV, and a Yukawa now and then
  b: [['b', 'b'], ['b', 'h']],                            // VVV, hVV
  h: [['h', 'h'], ['h', 'h'], ['b', 'b']],                // hhh, and back to bosons
};
const R = (() => { let s = SEED >>> 0; return () => {
  s = (s + 0x6D2B79F5) >>> 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}; })();
const pick = arr => arr[Math.floor(R() * arr.length) % arr.length];

const PAD = U * 0.28;
const SEP = num('sep', 0.42) * U;          // how close two pieces of line may come
const segs = () => edges.map(e => [verts[e.a], verts[e.b]]);

function ptSeg(p, s0, s1) {
  const vx = s1[0] - s0[0], vy = s1[1] - s0[1];
  const wx = p[0] - s0[0], wy = p[1] - s0[1];
  const L2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2));
  return Math.hypot(wx - vx * t, wy - vy * t);
}
// A new segment is refused if it comes within SEP of any existing one, which
// also rules out crossing it, or if its far end lands outside the frame.
function placeable(from, to, skipVerts) {
  if (to[0] < PAD || to[1] < PAD || to[0] > W - PAD || to[1] > H - PAD) return false;
  const list = segs();
  for (let i = 0; i < list.length; i++) {
    const [p, q] = list[i];
    const own = skipVerts.some(v => (verts[v] === p || verts[v] === q));
    const near = own ? SEP * 0.34 : SEP;   // its own parent legs may of course touch
    const steps = 12;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const m = [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u];
      if (own && u < 0.25) continue;
      if (ptSeg(m, p, q) < near) return false;
    }
  }
  for (let v = 0; v < verts.length; v++) {
    if (skipVerts.indexOf(v) >= 0) continue;
    if (Math.hypot(verts[v][0] - to[0], verts[v][1] - to[1]) < SEP) return false;
  }
  return true;
}

const GENS = num('gens', 10);
let frontier = tips;
let grown = 0;
for (let gen = 0; gen < GENS && frontier.length; gen++) {
  const next = [];
  // The step shortens as the field gets away from the centre, so the mesh
  // densifies outward rather than reaching the frame in three strides.
  const step = U * (0.95 - 0.07 * gen) * (gen === 0 ? 1.15 : 1);
  for (const leg of frontier) {
    const out = pick(RULES[leg.type]);
    // Outgoing legs open around the direction the leg was already going,
    // nudged toward straight out from the centre so nothing folds back in.
    const radial = Math.atan2(verts[leg.v][1] - CY, verts[leg.v][0] - CX);
    let bias = radial - leg.dir;
    while (bias > Math.PI) bias -= Math.PI * 2;
    while (bias < -Math.PI) bias += Math.PI * 2;
    const base = leg.dir + bias * 0.35;
    // A fermion carries on nearly straight and the boson comes off it; a
    // splitting scalar or boson opens symmetrically.
    const straight = leg.type === 'f' && out[0] === 'f';
    const wide = (0.34 + R() * 0.3) * (straight ? 1.55 : 1);
    const angles = straight
      ? [base + (R() - 0.5) * 0.24, base + (R() < 0.5 ? -wide : wide)]
      : [base - wide * (0.75 + R() * 0.5), base + wide * (0.75 + R() * 0.5)];
    const placed = [];
    for (let i = 0; i < out.length; i++) {
      const L = step * (0.82 + R() * 0.42);
      const to = [verts[leg.v][0] + Math.cos(angles[i]) * L,
                  verts[leg.v][1] + Math.sin(angles[i]) * L];
      const skip = [leg.v, ...placed.map(p => p.v)];
      if (!placeable(verts[leg.v], to, skip)) continue;
      const vi = V((to[0] - CX) / U, (to[1] - CY) / U);
      placed.push({ v: vi, type: out[i], dir: angles[i] });
    }
    // A vertex is only legal as a whole: unless both legs went down, the leg
    // stays a single line ending in the vacuum.
    if (placed.length < out.length) {
      placed.forEach(p => { verts.pop(); });
      continue;
    }
    // This vertex is a junction now, not an end, so its mark comes off.
    const was = endMark.get(leg.v);
    if (was) edges[was[0]][was[1]] = false;
    const taper = Math.max(MESH_S, CORE_S - gen * 0.14);
    placed.forEach(p => {
      const ei = E(leg.v, p.v, p.type, taper);
      edges[ei].xb = true;                  // until something grows out of it
      endMark.set(p.v, [ei, 'xb']);
      next.push(p);
    });
    grown++;
  }
  frontier = next;
}
// Whatever is still on the frontier ended in the vacuum, and is already
// flagged that way by the edge that reached it.

/* ---- the mesh that fills the rest --------------------------------------- */
const drawnNet = { verts, edges };
// build() takes rectangles and discs, so a line's keep-out is a row of small
// discs along it rather than one big one around its midpoint. A single disc
// per segment would clear a circle as wide as the segment is long, which on
// the core's own legs punched holes across half the frame.
const KEEP = U * 0.3;
const zones = [];
edges.forEach((e, ei) => {
  const p = verts[e.a], q = verts[e.b];
  // The hand-drawn centre is the subject, so it is given a wider berth than
  // the branches that grew out of it: the mesh crowding it would cost the one
  // thing on the slide anybody is meant to read.
  const r = ei < CORE_EDGES ? KEEP * 2.1 : KEEP;
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const n = Math.max(1, Math.ceil(L / (r * 0.8)));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    zones.push({ cx: p[0] + (q[0] - p[0]) * u, cy: p[1] + (q[1] - p[1]) * u, r });
  }
});

const chromePath = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${PAPER}; }
</style></head><body><canvas id="c" width="${W}" height="${H}"></canvas></body></html>`);
await page.addScriptTag({ content: await readFile(resolve(ROOT, 'design/network.js'), 'utf8') });

const stats = await page.evaluate(({ W, H, INK, ACCENT, PAPER, SEED, MESH_S, U, CX, CY,
                                     drawnNet, zones, CORE_EDGES, VEIL }) => {
  const N = window.SMMNet;
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
    legs.forEach(l => {
      if (l.length < 2) return;
      const k = l.slice().sort().join('');
      tally[k] = (tally[k] || 0) + 1;
    });
    return tally;
  };
  return { mesh: audit(mesh), drawn: audit(drawnNet),
           meshEdges: mesh.edges.length, meshVerts: mesh.verts.length };
}, { W, H, INK, ACCENT, PAPER, SEED, MESH_S, U, CX, CY, drawnNet, zones, CORE_EDGES, VEIL });

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
console.log(`  ${W}x${H} ${THEME}, core 9 lines + ${edges.length - CORE_EDGES} grown, `
  + `${stats.meshEdges} mesh lines`);
