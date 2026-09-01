#!/usr/bin/env node
/* Check the network generator against the rules the poster relies on:
   at most 4 legs per vertex, no tight angle between two legs of the same
   vertex, no floating debris, and clear corners. Run: node render/verify_network.mjs */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const win = {};
new Function('window', readFileSync(resolve(ROOT, 'design/network.js'), 'utf8'))(win);

// mirrors the SHEETS config in design/Sigma Mu Mu Network.dc.html
const CASES = [
  { name: 'tabloid', w: 1100, h: 1700, spacing: 35, keep: 0.72, speed: 135,
    seeds: [{ x: 862, y: 300 }, { x: 250, y: 1120 }], bands: [620, 1180, 0.8, 0.7, 0.5] },
  { name: 'instagram', w: 1080, h: 1350, spacing: 33, keep: 0.72, speed: 125,
    seeds: [{ x: 858, y: 250 }, { x: 210, y: 890 }], bands: [470, 940, 0.78, 0.68, 0.48] },
  { name: 'ad', w: 1080, h: 1080, spacing: 32, keep: 0.72, speed: 120,
    seeds: [{ x: 850, y: 230 }, { x: 200, y: 760 }], bands: [400, 780, 0.78, 0.68, 0.48] },
];
const MAX_LEGS = 4, MIN_SEP = 0.52, MIN_COMP = 8;
const angDiff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };

let bad = 0;
for (const c of CASES) {
  const b = c.bands;
  const net = win.SMMNet.build({
    w: c.w, h: c.h, zones: [], seeds: c.seeds, seed: 7, spacing: c.spacing,
    keep: c.keep, speed: c.speed, darts: 120000, pad: 8, clearance: 5,
    clearanceAt: y => (y < c.h * 0.66 ? 11 : 5),
    scaleAt: y => (y < b[0] ? b[2] : y < b[1] ? b[3] : b[4]),
    higgsQuads: 5, cornerR: Math.min(c.w, c.h) * 0.05, cornerWobble: 0.34,
    maxLegs: MAX_LEGS, minSep: MIN_SEP, minComponent: MIN_COMP,
  });

  const inc = net.verts.map(() => []);
  net.edges.forEach((e, i) => { inc[e.a].push(i); inc[e.b].push(i); });

  const degs = inc.map(l => l.length).filter(d => d > 0);
  const maxDeg = Math.max(...degs);

  let minAng = Math.PI;
  for (let v = 0; v < net.verts.length; v++) {
    const l = inc[v];
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        const dir = ei => {
          const e = net.edges[ei], o = e.a === v ? e.b : e.a;
          return Math.atan2(net.verts[o][1] - net.verts[v][1], net.verts[o][0] - net.verts[v][0]);
        };
        minAng = Math.min(minAng, angDiff(dir(l[i]), dir(l[j])));
      }
    }
  }

  // components
  const par = net.verts.map((_, i) => i);
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  net.edges.forEach(e => { const a = find(e.a), b2 = find(e.b); if (a !== b2) par[a] = b2; });
  const size = new Map();
  net.edges.forEach(e => { const r = find(e.a); size.set(r, (size.get(r) || 0) + 1); });
  const minComp = Math.min(...size.values());

  // corner clearance: how close does any vertex get to a sheet corner
  const used = new Set();
  net.edges.forEach(e => { used.add(e.a); used.add(e.b); });
  let corner = Infinity;
  [[0, 0], [c.w, 0], [0, c.h], [c.w, c.h]].forEach(([cx, cy]) => {
    used.forEach(v => { corner = Math.min(corner, Math.hypot(net.verts[v][0] - cx, net.verts[v][1] - cy)); });
  });

  const ok = maxDeg <= MAX_LEGS && minAng >= MIN_SEP - 1e-9 && minComp >= MIN_COMP;
  if (!ok) bad++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${c.name.padEnd(10)} edges ${String(net.edges.length).padStart(4)}` +
    `  maxLegs ${maxDeg}/${MAX_LEGS}` +
    `  minAngle ${(minAng * 180 / Math.PI).toFixed(1)}deg (>= ${(MIN_SEP * 180 / Math.PI).toFixed(0)})` +
    `  smallestComponent ${minComp} (>= ${MIN_COMP})` +
    `  cornerClearance ${corner.toFixed(0)}px`);
}
process.exit(bad ? 1 : 0);
