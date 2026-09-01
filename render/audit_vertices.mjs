#!/usr/bin/env node
/* Audit every vertex in the generated network against the Standard Model.
 *
 * Line styles map to particle classes:
 *   f  solid, straight   fermion
 *   b  wavy              gauge boson (vector)
 *   h  dashed, accent    scalar (Higgs)
 *
 * A vertex is legal if its multiset of legs is an SM interaction:
 *
 *   ffV      gauge coupling      (QED / QCD / weak)
 *   ffh      Yukawa
 *   VVV      triple gauge        (WWγ, WWZ, ggg)
 *   VVVV     quartic gauge       (WWWW, WWγγ, WWZZ, gggg)
 *   hVV      hWW, hZZ
 *   hhVV     hhWW, hhZZ
 *   hhh      Higgs self-coupling
 *   hhhh     quartic Higgs
 *
 * and illegal otherwise. Two rules do most of the work:
 *
 *   - A fermion line is continuous, so the number of fermion legs at a vertex
 *     is 0 or 2, never odd. fff, ffV+V, a lone f — all impossible.
 *   - The SM has no 4-point vertex involving fermions at tree level, so a
 *     fermion pair only ever meets one boson: degree 3.
 *
 * hhV is called out separately. For two *identical* neutral Higgs it vanishes:
 * the current h∂ᵤh is antisymmetric under exchanging the two legs, so hhZ and
 * hhγ are zero. It exists only for distinct scalars — γH⁺H⁻, ZhG⁰, ZhA — so on
 * a diagram where every dashed line reads as the same h, it does not belong.
 *
 * Run: node render/audit_vertices.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const win = {};
new Function('window', readFileSync(resolve(ROOT, 'design/network.js'), 'utf8'))(win);

const LEGAL = new Map([
  ['bff', 'ffV — gauge coupling'],
  ['ffh', 'ffh — Yukawa'],
  ['bbb', 'VVV — triple gauge'],
  ['bbbb', 'VVVV — quartic gauge'],
  ['bbh', 'hVV — hWW / hZZ'],
  ['bbhh', 'hhVV — hhWW / hhZZ'],
  ['hhh', 'hhh — Higgs self-coupling'],
  ['hhhh', 'hhhh — quartic Higgs'],
]);
const CONDITIONAL = new Map([
  ['bhh', 'hhV — zero for identical h; needs distinct scalars (γH⁺H⁻, ZhG⁰)'],
]);
const WHY = {
  f: 'odd number of fermion legs — a fermion line cannot end mid-diagram',
  four: 'no tree-level SM 4-point vertex involving fermions',
  vh: 'no VVVh or hhhV vertex in the SM',
};

const CASES = [
  { name: 'tabloid', w: 1100, h: 1700, spacing: 33, keep: 0.72, speed: 180,
    seeds: [{ x: 862, y: 300 }, { x: 250, y: 1120 }],
    bands: [[0, 0.72], [225, 1.12], [560, 1.32], [700, 0.86], [1180, 0.74], [1700, 0.5]] },
  { name: 'instagram', w: 1080, h: 1350, spacing: 31, keep: 0.72, speed: 175,
    seeds: [{ x: 858, y: 250 }, { x: 210, y: 890 }],
    bands: [[0, 0.7], [185, 1.08], [430, 1.28], [560, 0.84], [940, 0.72], [1350, 0.48]] },
];

function classify(key) {
  if (LEGAL.has(key)) return ['ok', LEGAL.get(key)];
  if (CONDITIONAL.has(key)) return ['conditional', CONDITIONAL.get(key)];
  const nf = (key.match(/f/g) || []).length;
  if (nf % 2) return ['bad', WHY.f];
  if (nf && key.length > 3) return ['bad', WHY.four];
  return ['bad', WHY.vh];
}

let failed = 0;
for (const c of CASES) {
  const b = c.bands;
  const net = win.SMMNet.build({
    w: c.w, h: c.h, zones: [], seeds: c.seeds, seed: 7, spacing: c.spacing,
    keep: c.keep, speed: c.speed, darts: 120000, pad: 8, clearance: 5,
    clearanceAt: y => (y < c.h * 0.66 ? 11 : 5),
    scaleAt: y => {
      if (y <= b[0][0]) return b[0][1];
      for (let i = 1; i < b.length; i++) {
        if (y <= b[i][0]) {
          const y0 = b[i - 1][0], s0 = b[i - 1][1], y1 = b[i][0], s1 = b[i][1];
          return s0 + (s1 - s0) * ((y - y0) / (y1 - y0 || 1));
        }
      }
      return b[b.length - 1][1];
    },
    higgsQuads: 5, cornerR: Math.min(c.w, c.h) * 0.05, cornerWobble: 0.34,
    maxLegs: 4, minSep: 0.52, minComponent: 8, fermionOptOut: 0.12,
  });

  const legs = net.verts.map(() => []);
  net.edges.forEach((e) => { legs[e.a].push(e.type); legs[e.b].push(e.type); });

  const tally = new Map();
  let total = 0;
  legs.forEach((l) => {
    if (l.length < 2) return;              // degree 1 is an external line, not a vertex
    const key = l.slice().sort().join('');
    tally.set(key, (tally.get(key) || 0) + 1);
    total++;
  });

  const rows = [...tally.entries()].sort((x, y) => y[1] - x[1]);
  let ok = 0, cond = 0, bad = 0;
  console.log(`\n${c.name} — ${total} vertices`);
  for (const [key, n] of rows) {
    const [verdict, note] = classify(key);
    if (verdict === 'ok') ok += n; else if (verdict === 'conditional') cond += n; else bad += n;
    const mark = verdict === 'ok' ? ' ok ' : verdict === 'conditional' ? 'COND' : 'BAD ';
    console.log(`  ${mark} ${key.padEnd(5)} ${String(n).padStart(5)}  ${(100 * n / total).toFixed(1).padStart(5)}%  ${note}`);
  }
  console.log(`  => legal ${(100 * ok / total).toFixed(1)}%, conditional ${(100 * cond / total).toFixed(1)}%, illegal ${(100 * bad / total).toFixed(1)}%`);
  if (bad || cond) failed = 1;
}
process.exit(failed);
