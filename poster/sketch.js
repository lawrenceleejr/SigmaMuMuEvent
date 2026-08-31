/* ───────────────────────────────────────────────────────────────────────────
   σμμ — A Physics × Industry Mixer
   Generative letterpress poster · p5.js

   A muon-collider event drawn as Swiss-modern line work: concentric detector
   rings of hairline arcs, a dimuon event at the interaction point, counter-
   circulating bunches, and an s-channel Feynman footnote — two letterpress
   inks (warm black + vermillion) on cream stock.

   Every frame is a pure function of the loop phase u ∈ [0,1), so renders are
   deterministic and the animation loops seamlessly.

   URL parameters:
     format = tabloid | ig | igsq | linkedin | livideo | story   (default tabloid)
     ss     = supersample factor (default 1)
     anim   = 1 live animation | 0 capture mode (default 1)
     t      = phase for capture mode stills (0..1)
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

/* ── palette: two inks on stock ── */
const PAPER = '#F5F1E6';
const INK   = '#231F1A';
const RED   = '#D8371D';

const LOOP_SECONDS = 20;
const TAU = Math.PI * 2;

/* ── format presets ─────────────────────────────────────────────────────────
   ring: center (fractions of w/h) and radius (fraction of w or h)
   hero: baseline y, target width (fraction of content width)              */
const PRESETS = {
  tabloid: {
    w: 3300, h: 5100, layout: 'portrait',
    ring: { cx: 0.500, cy: 0.360, r: 0.392, of: 'w' },
    hero: { base: 0.822, wf: 1.000 },
    detail: 'full',
  },
  ig: {
    w: 1080, h: 1350, layout: 'portrait',
    ring: { cx: 0.500, cy: 0.342, r: 0.340, of: 'w' },
    hero: { base: 0.800, wf: 0.840 },
    detail: 'compact',
  },
  igsq: {
    w: 1080, h: 1080, layout: 'square',
    ring: { cx: 0.500, cy: 0.360, r: 0.285, of: 'w' },
    hero: { base: 0.800, wf: 0.620 },
    detail: 'mini',
  },
  linkedin: {
    w: 1200, h: 627, layout: 'wide',
    ring: { cx: 0.730, cy: 0.500, r: 0.400, of: 'h' },
    hero: { base: 0.560, wf: 0.400 },
    detail: 'wide',
  },
  livideo: {
    w: 1920, h: 1080, layout: 'wide',
    ring: { cx: 0.735, cy: 0.500, r: 0.400, of: 'h' },
    hero: { base: 0.560, wf: 0.400 },
    detail: 'wide',
  },
  story: {
    w: 1080, h: 1920, layout: 'story',
    ring: { cx: 0.500, cy: 0.330, r: 0.430, of: 'w' },
    hero: { base: 0.770, wf: 0.860 },
    detail: 'compact',
  },
};

/* ── event copy ── */
const COPY = {
  title: 'σμμ',
  kicker: 'A PHYSICS × INDUSTRY MIXER',
  dateShort: 'DEC 13 · 2026',
  when1: 'Sunday, December 13, 2026',
  when2: 'Doors 5:00 PM · Cocktail Hour',
  where1: 'Stanford Campus',
  where2: 'Bay Area, California',
  prog: [
    ['5:00', 'Industry µBooths & Cocktails'],
    ['5:50', 'The 10 TeV Muon Collider'],
    ['6:15', 'Research Fair · Drink Tickets'],
  ],
  progMini: 'µBOOTHS · 10 TeV TALK · RESEARCH FAIR',
  footL: 'HEP ALUMNI × INDUSTRY × MUON COLLIDER RESEARCH',
  footR: 'DRINKS SERVED KNOXVILLE-STYLE',
};

/* ── deterministic PRNG ── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── URL params / global config ── */
const Q = new URLSearchParams(window.location.search);
const FORMAT = Q.get('format') || 'tabloid';
const SS = parseFloat(Q.get('ss') || '1');
const ANIM = Q.get('anim') !== '0';
const T0 = parseFloat(Q.get('t') || '0.13');
const PRE = PRESETS[FORMAT] || PRESETS.tabloid;

const W = Math.round((parseInt(Q.get('w'), 10) || PRE.w) * SS);
const H = Math.round((parseInt(Q.get('h'), 10) || PRE.h) * SS);

/* ── the poster system (built once, drawn per phase) ── */
let SYS = null;

function buildSystem(p) {
  const w = W, h = H;
  const m = 0.072 * w;                                   // grid margin
  const S = Math.min(w, h);
  const hl = Math.max(0.75, 0.0017 * S);                 // hairline weight
  const ring = {
    cx: PRE.ring.cx * w,
    cy: PRE.ring.cy * h,
    R: PRE.ring.r * (PRE.ring.of === 'w' ? w : h),
  };

  const rng = mulberry32(20261213);

  /* ── ring ensemble ──
     bands from outside in: muon system, hcal, solenoid, ecal, tracker      */
  const rings = [];
  const gapA = 1.94;                       // service-gap wedge angle (radians)
  const gapW = 0.16;                       // wedge width

  function addRing(rr, opts) {
    const seg = opts.seg;                  // number of dash cells
    const duty = opts.duty;                // fraction of cell that is inked
    const segs = [];
    if (seg <= 1) {
      segs.push([0, TAU]);
    } else {
      const cell = TAU / seg;
      const phase0 = rng() * cell;         // de-align dash columns across rings
      for (let i = 0; i < seg; i++) {
        const a0 = i * cell + phase0;
        const d = duty * (0.92 + 0.16 * rng());
        // service gap: skip cells inside the wedge
        const mid = a0 + cell * d / 2;
        if (opts.gap && Math.abs(((mid - gapA + TAU + Math.PI) % TAU) - Math.PI) < gapW) continue;
        segs.push([a0, a0 + cell * d]);
      }
    }
    rings.push({
      r: rr * ring.R,
      w: (opts.w || 1) * hl,
      alpha: opts.alpha != null ? opts.alpha : 1,
      red: !!opts.red,
      segs,
      oscA: (opts.oscA != null ? opts.oscA : 0.018) * (rng() < 0.5 ? -1 : 1),
      oscK: opts.oscK != null ? opts.oscK : (rng() < 0.72 ? 1 : 2),
      oscP: rng(),
      slide: opts.slide != null ? opts.slide : 0,
      cell: seg > 1 ? TAU / seg : 0,
    });
  }

  // muon system — sparse, chunky dashes, the outer signature
  addRing(1.000, { seg: 14, duty: 0.62, w: 2.5, oscA: 0.014, gap: true });
  addRing(0.962, { seg: 22, duty: 0.55, w: 1.0, oscA: 0.020, slide: 1, gap: true });
  addRing(0.932, { seg: 22, duty: 0.72, w: 1.0, oscA: 0.016, gap: true });
  addRing(0.898, { seg: 44, duty: 0.60, w: 1.0, alpha: 0.85, oscA: 0.022, slide: -1, gap: true });
  addRing(0.868, { seg: 11, duty: 0.80, w: 1.0, alpha: 0.9, oscA: 0.012, gap: true });

  // hcal — the dense hairline body: many close rings, fine dashes
  const hcalN = 10;
  for (let i = 0; i < hcalN; i++) {
    const f = i / (hcalN - 1);
    addRing(0.816 - 0.126 * f, {
      seg: [48, 56, 40, 72, 52, 64, 44, 56, 68, 60][i],
      duty: 0.78 + 0.16 * rng(),
      w: 1, alpha: 0.72,
      oscA: 0.008 + 0.014 * rng(),
      slide: [1, -1, 0, 2, 0, -1, 1, 0, -2, 1][i],
      gap: true,
    });
  }

  // solenoid — three still, solid anchors (one heavy)
  addRing(0.652, { seg: 1, duty: 1, w: 1.0, oscA: 0, oscK: 0 });
  addRing(0.638, { seg: 1, duty: 1, w: 2.2, oscA: 0, oscK: 0 });
  addRing(0.622, { seg: 1, duty: 1, w: 1.0, oscA: 0, oscK: 0 });

  // ecal boundaries — fine, nearly-full dashes
  addRing(0.588, { seg: 72, duty: 0.86, w: 1, alpha: 0.9, oscA: 0.006, slide: 1 });
  addRing(0.480, { seg: 72, duty: 0.86, w: 1, alpha: 0.9, oscA: 0.006, slide: -1 });

  // tracker support — whisper-faint circles so tracks have air
  addRing(0.430, { seg: 120, duty: 0.55, w: 1, alpha: 0.30, oscA: 0.004 });
  addRing(0.255, { seg: 1, duty: 1, w: 1, alpha: 0.18, oscA: 0 });
  addRing(0.075, { seg: 1, duty: 1, w: 1, alpha: 0.8, oscA: 0 });   // beam pipe

  /* ── ecal cells: radial ticks between the two ecal boundary rings ── */
  const ecal = { r0: 0.492 * ring.R, r1: 0.576 * ring.R, n: 132 };

  /* ── tracks: two jets + strays, arcs from the beam pipe to the ecal ── */
  const tracks = [];
  function addTrack(theta, curv, rEnd, o) {
    tracks.push({
      theta, curv, r0: 0.075 * ring.R, r1: rEnd * ring.R,
      w: (o && o.w || 1) * hl, alpha: o && o.alpha != null ? o.alpha : 0.85,
      red: !!(o && o.red), dash: !!(o && o.dash),
      breathe: 0.4 + 0.6 * rng(), bp: rng(),
    });
  }
  const jetA = 0.64, jetB = 3.62;   // radians
  for (let i = 0; i < 8; i++) {
    const t = jetA + (rng() - 0.5) * 0.52;
    addTrack(t, (rng() < 0.5 ? -1 : 1) * (0.35 + 1.15 * rng()), 0.478, { alpha: 0.68 + 0.28 * rng(), w: 1.15 });
  }
  for (let i = 0; i < 6; i++) {
    const t = jetB + (rng() - 0.5) * 0.40;
    addTrack(t, (rng() < 0.5 ? -1 : 1) * (0.35 + 1.05 * rng()), 0.478, { alpha: 0.68 + 0.28 * rng(), w: 1.15 });
  }
  for (let i = 0; i < 5; i++) {
    const t = rng() * TAU;
    addTrack(t, (rng() < 0.5 ? -1 : 1) * (0.8 + 0.9 * rng()), 0.478, { alpha: 0.5 + 0.3 * rng(), w: 1.1 });
  }
  // photons: dashed, straight, to the ecal face
  addTrack(jetA + 0.42, 0.0001, 0.487, { dash: true, alpha: 0.55 });
  addTrack(jetB - 0.34, 0.0001, 0.487, { dash: true, alpha: 0.55 });

  /* ── the dimuon: two red, nearly-straight chords through everything ── */
  const muons = [
    { theta: 1.13, curv: +0.145, r1: 1.045 * ring.R, w: 2.6 * hl },
    { theta: 1.13 + Math.PI - 0.27, curv: -0.13, r1: 1.045 * ring.R, w: 2.6 * hl },
  ];

  /* ── calorimeter hits: cells lit where jets & photons land ── */
  const caloHits = [];
  function lightCells(theta, count, boost, red) {
    const n = ecal.n;
    const c0 = Math.round(((theta % TAU) + TAU) % TAU / (TAU / n));
    for (let i = 0; i < count; i++) {
      const k = (c0 + i - Math.floor(count / 2) + n) % n;
      const e = boost * (1 - Math.abs(i - count / 2) / (count / 2 + 0.6)) * (0.55 + 0.6 * rng());
      caloHits.push({ cell: k, e: Math.min(1, e), red: !!red, pp: rng() });
    }
  }
  lightCells(jetA + 0.05, 7, 1.25);
  lightCells(jetB - 0.03, 6, 1.1);
  lightCells(jetA + 0.42, 2, 1.35, true);   // photon deposits, red
  lightCells(jetB - 0.34, 2, 1.2, true);

  // radii of the muon-chamber bands the red chords will mark as they cross
  const muBandRR = [0.868, 0.898, 0.932, 0.962];

  /* ── counter-circulating bunches (μ⁺ red, μ⁻ ink) on an outer orbit ── */
  const orbitR = 1.075 * ring.R;

  return { w, h, m, S, hl, ring, rings, ecal, tracks, muons, caloHits, muBandRR, orbitR, rng };
}

/* ═════════════════════════ drawing helpers ═════════════════════════ */

function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

function inkA(ctx, alpha) { ctx.strokeStyle = rgba(INK, alpha); }
function redA(ctx, alpha) { ctx.strokeStyle = rgba(RED, alpha); }
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* arc of constant curvature leaving the origin at angle theta.
   curv is signed; k = curvature scaled to the ring radius. */
function trackPoint(sys, theta, curv, s) {
  // s: arc length from origin. Parametrize a circle through the origin
  // tangent to direction theta, radius rho = R/curv.
  const rho = sys.ring.R / (Math.abs(curv) + 1e-9);
  const sgn = Math.sign(curv || 1);
  const phi = s / rho;
  // local coords: x along theta, y left of theta
  const lx = rho * Math.sin(phi);
  const ly = sgn * rho * (1 - Math.cos(phi));
  const ct = Math.cos(theta), st = Math.sin(theta);
  return [sys.ring.cx + lx * ct - ly * st, sys.ring.cy + lx * st + ly * ct];
}

function drawTrack(ctx, sys, tr, u) {
  const breathe = 1 + 0.045 * Math.sin(TAU * (u + tr.bp)) * tr.breathe;
  const curv = tr.curv * breathe;
  ctx.beginPath();
  const steps = 46;
  let started = false;
  for (let i = 0; i <= steps; i++) {
    const s = tr.r0 + (i / steps) * (tr.r1 * 1.35 - tr.r0);
    const [x, y] = trackPoint(sys, tr.theta, curv, s);
    const rr = Math.hypot(x - sys.ring.cx, y - sys.ring.cy);
    if (rr > tr.r1) break;
    if (rr < tr.r0) continue;
    if (tr.dash && (i % 4 === 2 || i % 4 === 3)) { started = false; continue; }
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.lineWidth = tr.w;
  if (tr.red) redA(ctx, tr.alpha); else inkA(ctx, tr.alpha);
  ctx.stroke();
}

/* ═════════════════════════ typography ═════════════════════════ */

function fontStr(weight, sizePx, mono) {
  return `${weight} ${sizePx}px ${mono ? '"JetBrains Mono"' : '"Inter Tight"'}`;
}

/* char-by-char typesetting with em tracking; returns advance width */
function typeWidth(ctx, str, o) {
  ctx.font = fontStr(o.weight || 400, o.size, o.mono);
  let w = 0;
  for (const ch of str) w += ctx.measureText(ch).width + (o.tracking || 0) * o.size;
  if (str.length) w -= (o.tracking || 0) * o.size;
  return w;
}

function drawType(ctx, str, x, y, o) {
  ctx.font = fontStr(o.weight || 400, o.size, o.mono);
  ctx.fillStyle = o.color || INK;
  ctx.textBaseline = o.baseline || 'alphabetic';
  let cx = x;
  if (o.align === 'right') cx = x - typeWidth(ctx, str, o);
  else if (o.align === 'center') cx = x - typeWidth(ctx, str, o) / 2;
  for (const ch of str) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + (o.tracking || 0) * o.size;
  }
  return cx - (o.tracking || 0) * o.size - x;
}

/* rich runs: [{t:'μ'},{sup:'+'},{t:'μ'},{sup:'−'},...] for physics strings */
function drawRich(ctx, runs, x, y, o) {
  let cx = x;
  for (const r of runs) {
    if (r.t != null) {
      cx += drawType(ctx, r.t, cx, y, o) + (o.tracking || 0) * o.size;
    } else if (r.sup != null || r.sub != null) {
      const s = { ...o, size: o.size * 0.62 };
      const dy = r.sup != null ? -o.size * 0.38 : o.size * 0.12;
      cx += drawType(ctx, r.sup != null ? r.sup : r.sub, cx, y + dy, s) + (o.tracking || 0) * o.size;
    } else if (r.arrow) {
      // hand-drawn → : shaft + solid head (the subset fonts lack U+2192)
      const L = o.size * 0.92, ah = o.size * 0.16;
      const yy = y - o.size * 0.30;
      ctx.strokeStyle = o.color || INK; ctx.fillStyle = o.color || INK;
      ctx.lineWidth = Math.max(1, o.size * 0.07);
      ctx.beginPath(); ctx.moveTo(cx + o.size * 0.12, yy); ctx.lineTo(cx + L - ah, yy); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + L, yy); ctx.lineTo(cx + L - ah * 1.5, yy - ah * 0.8);
      ctx.lineTo(cx + L - ah * 1.5, yy + ah * 0.8); ctx.closePath(); ctx.fill();
      cx += L + o.size * 0.24;
    }
  }
  return cx - x;
}

function richWidth(ctx, runs, o) {
  let w = 0;
  for (const r of runs) {
    if (r.t != null) w += typeWidth(ctx, r.t, o) + (o.tracking || 0) * o.size;
    else if (r.sup != null || r.sub != null) w += typeWidth(ctx, r.sup != null ? r.sup : r.sub, { ...o, size: o.size * 0.62 }) + (o.tracking || 0) * o.size;
    else if (r.arrow) w += o.size * 0.92 + o.size * 0.24;
  }
  return w;
}

function fitSize(ctx, str, o, targetW) {
  let lo = 4, hi = targetW * 3;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (typeWidth(ctx, str, { ...o, size: mid }) > targetW) hi = mid; else lo = mid;
  }
  return lo;
}

/* ═════════════════════════ paper & grain ═════════════════════════ */

let GRAIN = null;
function buildGrain(w, h) {
  const g = document.createElement('canvas');
  g.width = Math.ceil(w / 2); g.height = Math.ceil(h / 2);
  const gc = g.getContext('2d');
  const img = gc.createImageData(g.width, g.height);
  const d = img.data;
  const rng = mulberry32(77);
  for (let i = 0; i < d.length; i += 4) {
    const v = rng();
    // sparse fiber flecks, both darker and lighter than stock
    const dark = v < 0.16 ? (0.16 - v) * 255 * 1.4 : 0;
    const lite = v > 0.86 ? (v - 0.86) * 255 * 1.6 : 0;
    d[i] = 35; d[i + 1] = 31; d[i + 2] = 26;
    d[i + 3] = Math.min(255, dark) * 0.55;
    if (lite > 0) { d[i] = 255; d[i + 1] = 252; d[i + 2] = 240; d[i + 3] = Math.min(255, lite) * 0.5; }
  }
  gc.putImageData(img, 0, 0);
  return g;
}

/* ═════════════════════════ scene passes ═════════════════════════ */

function drawPaper(ctx, sys) {
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, sys.w, sys.h);
  // gentle edge-ageing
  const g = ctx.createRadialGradient(sys.w / 2, sys.h / 2, Math.min(sys.w, sys.h) * 0.35,
    sys.w / 2, sys.h / 2, Math.hypot(sys.w, sys.h) * 0.62);
  g.addColorStop(0, 'rgba(35,31,26,0)');
  g.addColorStop(1, 'rgba(35,31,26,0.055)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sys.w, sys.h);
  ctx.restore();
}

function drawBeamAxis(ctx, sys, u) {
  const { ring, hl, w } = sys;
  // in wide layouts the beam line stays behind the ring, off the text block
  const x0 = PRE.layout === 'wide' ? 0.40 * w : 0;
  ctx.save();
  ctx.setLineDash([hl * 6, hl * 6]);
  ctx.lineWidth = hl;
  inkA(ctx, 0.22);
  ctx.beginPath();
  ctx.moveTo(x0, ring.cy); ctx.lineTo(w, ring.cy);
  ctx.stroke();
  ctx.setLineDash([]);
  // beam arrows pointing toward the IP, just outside the orbit
  const ax = sys.orbitR + 0.035 * ring.R;
  for (const dir of [-1, 1]) {
    const x0 = ring.cx + dir * (ax + 0.05 * ring.R);
    const x1 = ring.cx + dir * ax;
    if (x1 < 0 || x1 > w) continue;
    ctx.lineWidth = hl * 1.4; inkA(ctx, 0.75);
    ctx.beginPath(); ctx.moveTo(x0, ring.cy); ctx.lineTo(x1, ring.cy); ctx.stroke();
    ctx.fillStyle = rgba(INK, 0.75);
    ctx.beginPath();
    ctx.moveTo(x1 - dir * 0.1, ring.cy);
    ctx.lineTo(x1 + dir * hl * 4.5, ring.cy - hl * 2.6);
    ctx.lineTo(x1 + dir * hl * 4.5, ring.cy + hl * 2.6);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawRings(ctx, sys, u) {
  const { ring } = sys;
  ctx.save();
  ctx.lineCap = 'butt';
  for (const rg of sys.rings) {
    const rot = rg.oscA * Math.sin(TAU * (rg.oscK * u + rg.oscP))
      + rg.slide * rg.cell * u;
    ctx.lineWidth = rg.w;
    if (rg.red) redA(ctx, rg.alpha); else inkA(ctx, rg.alpha);
    ctx.beginPath();
    for (const [a0, a1] of rg.segs) {
      ctx.moveTo(...polar(ring.cx, ring.cy, rg.r, a0 + rot));
      ctx.arc(ring.cx, ring.cy, rg.r, a0 + rot, a1 + rot);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawEcal(ctx, sys, u) {
  const { ring, ecal, hl } = sys;
  ctx.save();
  ctx.lineCap = 'butt';
  // cells: fine radial ticks
  ctx.lineWidth = hl;
  inkA(ctx, 0.55);
  ctx.beginPath();
  for (let i = 0; i < ecal.n; i++) {
    const a = (i / ecal.n) * TAU;
    ctx.moveTo(...polar(ring.cx, ring.cy, ecal.r0, a));
    ctx.lineTo(...polar(ring.cx, ring.cy, ecal.r0 + (ecal.r1 - ecal.r0) * 0.30, a));
  }
  ctx.stroke();
  // hits: cells filled outward in proportion to energy, pulsing gently
  for (const hit of sys.caloHits) {
    const a = (hit.cell / ecal.n) * TAU;
    const pulse = 0.88 + 0.12 * Math.sin(TAU * (u + hit.pp));
    const len = (ecal.r1 - ecal.r0) * (0.3 + 0.7 * hit.e * pulse);
    ctx.lineWidth = hl * 2.4;
    if (hit.red) redA(ctx, 0.92); else inkA(ctx, 0.88);
    ctx.beginPath();
    ctx.moveTo(...polar(ring.cx, ring.cy, ecal.r0, a));
    ctx.lineTo(...polar(ring.cx, ring.cy, ecal.r0 + len, a));
    ctx.stroke();
  }
  ctx.restore();
}

function drawTracksAndMuons(ctx, sys, u) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const tr of sys.tracks) drawTrack(ctx, sys, tr, u);

  // the dimuon pair + chamber marks computed on the live (breathing) geometry
  for (const mu of sys.muons) {
    const breathe = 1 + 0.045 * Math.sin(TAU * (u + 0.2)) * 0.5;
    const curv = mu.curv * breathe;
    for (const rr of sys.muBandRR) {
      const hit = trackRadiusCrossing(sys, mu.theta, curv, rr * sys.ring.R);
      if (!hit) continue;
      const [x, y, tangent] = hit;
      const ta = Math.atan2(y - sys.ring.cy, x - sys.ring.cx) + Math.PI / 2;
      const L = sys.ring.R * 0.020;
      ctx.lineWidth = 2.1 * sys.hl; redA(ctx, 0.9);
      ctx.beginPath();
      ctx.moveTo(x - L * Math.cos(ta), y - L * Math.sin(ta));
      ctx.lineTo(x + L * Math.cos(ta), y + L * Math.sin(ta));
      ctx.stroke();
    }
    drawTrack(ctx, sys, {
      theta: mu.theta, curv: mu.curv, r0: 0.075 * sys.ring.R, r1: mu.r1,
      w: mu.w, alpha: 0.96, red: true, dash: false, breathe: 0.5, bp: 0.2,
    }, u);
  }
  ctx.restore();
}

/* bisect arc length until the track sits on the target radius (monotonic for
   the gently-curved muons) */
function trackRadiusCrossing(sys, theta, curv, targetR) {
  let lo = 0, hi = sys.ring.R * 2.5;
  const rOf = (s) => {
    const [x, y] = trackPoint(sys, theta, curv, s);
    return Math.hypot(x - sys.ring.cx, y - sys.ring.cy);
  };
  if (rOf(hi) < targetR) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rOf(mid) < targetR) lo = mid; else hi = mid;
  }
  const [x, y] = trackPoint(sys, theta, curv, (lo + hi) / 2);
  return [x, y, 0];
}

function drawIP(ctx, sys) {
  const { ring, hl } = sys;
  ctx.save();
  // registration crosshair
  inkA(ctx, 0.8); ctx.lineWidth = hl;
  const c = 0.030 * ring.R;
  ctx.beginPath();
  ctx.moveTo(ring.cx - c, ring.cy); ctx.lineTo(ring.cx + c, ring.cy);
  ctx.moveTo(ring.cx, ring.cy - c); ctx.lineTo(ring.cx, ring.cy + c);
  ctx.stroke();
  // red IP dot
  ctx.fillStyle = rgba(RED, 0.96);
  ctx.beginPath(); ctx.arc(ring.cx, ring.cy, hl * 2.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBunches(ctx, sys, u) {
  const { ring, hl } = sys;
  ctx.save();
  // faint orbit guide
  inkA(ctx, 0.28); ctx.lineWidth = hl;
  ctx.beginPath(); ctx.arc(ring.cx, ring.cy, sys.orbitR, 0, TAU); ctx.stroke();
  // μ+ (red) clockwise, μ− (ink) counter-clockwise; meet at 0 and π
  const bunches = [
    { a: -TAU * u, color: RED },
    { a: TAU * u, color: INK },
  ];
  for (const b of bunches) {
    // comet tail
    for (let i = 1; i <= 7; i++) {
      const ta = b.a + (b.color === RED ? 1 : -1) * i * 0.028;
      const [x, y] = polar(ring.cx, ring.cy, sys.orbitR, ta);
      ctx.fillStyle = rgba(b.color, 0.30 * (1 - i / 8));
      ctx.beginPath(); ctx.arc(x, y, hl * 1.9 * (1 - i / 9), 0, TAU); ctx.fill();
    }
    const [x, y] = polar(ring.cx, ring.cy, sys.orbitR, b.a);
    ctx.fillStyle = rgba(b.color, 0.95);
    ctx.beginPath(); ctx.arc(x, y, hl * 2.6, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/* small s-channel Feynman footnote: μ⁺μ⁻ → γ*/ /* → X, hand-drawn */
function drawFeynman(ctx, sys, x, y, sc, u, labels) {
  const hl = sys.hl;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = hl;
  inkA(ctx, 0.9);
  const v1 = [x, y], v2 = [x + sc * 0.44, y];
  const leg = sc * 0.34;
  // incoming legs
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(v1[0] - leg, v1[1] + s * leg * 0.78);
    ctx.lineTo(v1[0], v1[1]);
    ctx.stroke();
    // arrow midway (fermion flow)
    arrowOn(ctx, v1[0] - leg, v1[1] + s * leg * 0.78, v1[0], v1[1], 0.55, hl, INK);
  }
  // outgoing legs
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(v2[0], v2[1]);
    ctx.lineTo(v2[0] + leg, v2[1] + s * leg * 0.78);
    ctx.stroke();
    arrowOn(ctx, v2[0], v2[1], v2[0] + leg, v2[1] + s * leg * 0.78, 0.6, hl, INK);
  }
  // wavy boson, phase slides one wavelength per loop
  const nW = 5;
  ctx.beginPath();
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const px = v1[0] + (v2[0] - v1[0]) * f;
    const py = y + Math.sin(TAU * (nW * f + u)) * sc * 0.058 * Math.sin(Math.PI * f);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // vertices
  ctx.fillStyle = rgba(INK, 0.95);
  for (const v of [v1, v2]) { ctx.beginPath(); ctx.arc(v[0], v[1], hl * 1.7, 0, TAU); ctx.fill(); }
  if (labels) {
    const o = { size: sc * 0.135, weight: 400, mono: true, color: rgba(INK, 0.9) };
    drawRich(ctx, [{ t: 'μ' }, { sup: '−' }], v1[0] - leg - sc * 0.05 - richWidth(ctx, [{ t: 'μ' }, { sup: '−' }], o), v1[1] - leg * 0.60, o);
    drawRich(ctx, [{ t: 'μ' }, { sup: '+' }], v1[0] - leg - sc * 0.05 - richWidth(ctx, [{ t: 'μ' }, { sup: '+' }], o), v1[1] + leg * 0.92, o);
    drawType(ctx, 'γ*/Z', (v1[0] + v2[0]) / 2, y - sc * 0.115, { ...o, align: 'center' });
    drawType(ctx, 'X', v2[0] + leg + sc * 0.05, v2[1] - leg * 0.60, o);
  }
  ctx.restore();
}

function arrowOn(ctx, x0, y0, x1, y1, f, hl, color) {
  const mx = x0 + (x1 - x0) * f, my = y0 + (y1 - y0) * f;
  const a = Math.atan2(y1 - y0, x1 - x0);
  const s = hl * 3.4;
  ctx.fillStyle = rgba(color, 0.95);
  ctx.beginPath();
  ctx.moveTo(mx + s * Math.cos(a), my + s * Math.sin(a));
  ctx.lineTo(mx + s * Math.cos(a + 2.55), my + s * Math.sin(a + 2.55));
  ctx.lineTo(mx + s * Math.cos(a - 2.55), my + s * Math.sin(a - 2.55));
  ctx.closePath(); ctx.fill();
}

/* ═════════════════════════ type layouts ═════════════════════════ */

function heroBlock(ctx, sys, baseY, targetW) {
  const { w, m } = sys;
  const o = { weight: 800, tracking: -0.018 };
  const size = fitSize(ctx, COPY.title, o, targetW);
  const ho = { ...o, size };
  const x = m;
  // letterpress misregistration: red plate first, slightly off; ink on top
  const dx = 0.0034 * w, dy = 0.0024 * w;
  drawType(ctx, COPY.title, x + dx, baseY + dy, { ...ho, color: RED });
  drawType(ctx, COPY.title, x, baseY, { ...ho, color: INK });
  return size;
}

function kickerLine(ctx, sys, y, sizeF) {
  const { m } = sys;
  const size = sizeF * sys.S;
  const o = { size, weight: 600, tracking: 0.18 };
  // set "×" in red inside the tracked caps line
  const parts = COPY.kicker.split('×');
  let x = m;
  x += drawType(ctx, parts[0], x, y, { ...o, color: INK }) + o.tracking * size;
  x += drawType(ctx, '×', x, y, { ...o, color: RED }) + o.tracking * size;
  drawType(ctx, parts[1], x, y, { ...o, color: INK });
}

function physicsCaption(ctx, sys, x, y, size, align) {
  const o = { size, weight: 400, mono: true, tracking: 0.02, color: rgba(INK, 0.92) };
  const runs = [
    { t: 'σ(μ' }, { sup: '+' }, { t: 'μ' }, { sup: '−' }, { arrow: true },
    { t: ' X)   ·   10 TeV' },
  ];
  let ax = x;
  if (align === 'right') ax = x - richWidth(ctx, runs, o);
  drawRich(ctx, runs, ax, y, o);
}

function ruleLine(ctx, sys, x0, x1, y, alpha) {
  ctx.strokeStyle = rgba(INK, alpha != null ? alpha : 0.9);
  ctx.lineWidth = sys.hl;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
}

function infoColumn(ctx, sys, x, y, label, rows) {
  const s = sys.S;
  const lo = { size: 0.0100 * s, weight: 500, mono: true, tracking: 0.14, color: RED };
  drawType(ctx, label, x, y, lo);
  const ro = { size: 0.0148 * s, weight: 500, tracking: 0.01, color: INK };
  let yy = y + 0.0248 * s;
  for (const r of rows) {
    if (Array.isArray(r)) {
      drawType(ctx, r[0], x, yy, { ...ro, mono: true, weight: 400, size: 0.0128 * s, color: rgba(INK, 0.85) });
      drawType(ctx, r[1], x + 0.052 * s, yy, ro);
    } else {
      drawType(ctx, r, x, yy, ro);
    }
    yy += 0.0236 * s;
  }
  return yy;
}

function layoutPortrait(ctx, sys, u) {
  const { w, h, m, S } = sys;
  const compact = PRE.detail !== 'full';

  // top strip
  const topY = m * 0.92;
  kickerLine(ctx, sys, topY, 0.0165);
  drawType(ctx, COPY.dateShort, w - m, topY, {
    size: 0.0165 * S, weight: 600, tracking: 0.22, color: INK, align: 'right',
  });
  ruleLine(ctx, sys, m, w - m, topY + 0.016 * S, 0.9);

  // hero
  const baseY = PRE.hero.base * h;
  const heroSize = heroBlock(ctx, sys, baseY, PRE.hero.wf * (w - 2 * m));

  if (!compact) {
    // technical band between the ring's skirt and the hero:
    // Feynman footnote at left, physics caption at right
    const ringBottom = sys.ring.cy + sys.orbitR;
    const heroTop = baseY - 0.560 * heroSize;
    const bandY = (ringBottom + heroTop) / 2 - 0.007 * h;
    const sc = 0.084 * w;
    drawFeynman(ctx, sys, m + 0.56 * sc, bandY, sc, u, true);
    physicsCaption(ctx, sys, w - m, bandY + 0.015 * S, 0.0122 * S, 'right');

    // three info columns under the hero
    const gy = 0.902 * h;
    const cw = (w - 2 * m);
    infoColumn(ctx, sys, m, gy, 'WHEN', [COPY.when1, COPY.when2]);
    infoColumn(ctx, sys, m + cw * 0.300, gy, 'PROGRAM', COPY.prog);
    infoColumn(ctx, sys, m + cw * 0.780, gy, 'WHERE', [COPY.where1, COPY.where2]);

    // footer
    const fy = 0.962 * h;
    ruleLine(ctx, sys, m, w - m, fy, 0.9);
    drawType(ctx, COPY.footL, m, fy + 0.017 * S, { size: 0.0100 * S, weight: 500, tracking: 0.18, color: rgba(INK, 0.9) });
    drawType(ctx, COPY.footR, w - m, fy + 0.017 * S, { size: 0.0100 * S, weight: 500, tracking: 0.18, color: rgba(INK, 0.9), align: 'right' });
    // printer's mark, sitting on the info-label row
    ctx.fillStyle = RED;
    ctx.fillRect(w - m - 0.0115 * S, gy - 0.0095 * S, 0.0115 * S, 0.0115 * S);
  } else {
    // compact: two info lines + mini program
    const gy = 0.905 * h;
    drawType(ctx, 'SUN DEC 13 2026 · 5:00 PM', m, gy, { size: 0.0180 * S, weight: 600, tracking: 0.10, color: INK });
    drawType(ctx, 'STANFORD CAMPUS', w - m, gy, { size: 0.0180 * S, weight: 600, tracking: 0.10, color: INK, align: 'right' });
    ruleLine(ctx, sys, m, w - m, gy + 0.018 * S, 0.85);
    drawType(ctx, COPY.progMini, m, gy + 0.048 * S, { size: 0.0128 * S, weight: 400, mono: true, tracking: 0.06, color: rgba(INK, 0.9) });
    physicsCaption(ctx, sys, w - m, gy + 0.048 * S, 0.0115 * S, 'right');
  }
}

function layoutSquare(ctx, sys, u) {
  const { w, h, m, S } = sys;
  const topY = m * 0.92;
  kickerLine(ctx, sys, topY, 0.0170);
  drawType(ctx, COPY.dateShort, w - m, topY, { size: 0.0170 * S, weight: 600, tracking: 0.22, color: INK, align: 'right' });
  ruleLine(ctx, sys, m, w - m, topY + 0.017 * S, 0.9);

  const baseY = PRE.hero.base * h;
  heroBlock(ctx, sys, baseY, PRE.hero.wf * (w - 2 * m));
  physicsCaption(ctx, sys, w - m, baseY - 0.005 * h, 0.0125 * S, 'right');

  const gy = 0.905 * h;
  drawType(ctx, 'SUN DEC 13 2026 · 5:00 PM', m, gy, { size: 0.0175 * S, weight: 600, tracking: 0.10, color: INK });
  drawType(ctx, 'STANFORD CAMPUS', w - m, gy, { size: 0.0175 * S, weight: 600, tracking: 0.10, color: INK, align: 'right' });
  ruleLine(ctx, sys, m, w - m, gy + 0.018 * S, 0.85);
  drawType(ctx, COPY.progMini, m, gy + 0.047 * S, { size: 0.0122 * S, weight: 400, mono: true, tracking: 0.05, color: rgba(INK, 0.9) });
  ctx.fillStyle = RED;
  ctx.fillRect(w - m - 0.013 * S, gy + 0.047 * S - 0.013 * S, 0.013 * S, 0.013 * S);
}

function layoutWide(ctx, sys, u) {
  const { w, h, S } = sys;
  const m = 0.055 * w;
  const leftW = 0.415 * w;

  // kicker
  kickerLine(ctx, sys, 0.155 * h, 0.026);

  // hero
  const o = { weight: 800, tracking: -0.018 };
  const size = fitSize(ctx, COPY.title, o, PRE.hero.wf * w);
  const baseY = PRE.hero.base * h;
  const dx = 0.0022 * w, dy = 0.0016 * w;
  drawType(ctx, COPY.title, m + dx, baseY + dy, { ...o, size, color: rgba(RED, 0.9) });
  drawType(ctx, COPY.title, m, baseY, { ...o, size, color: INK });

  // info lines, sized to stay clear of the ring
  const infoStr = 'SUN DEC 13 2026 · 5:00 PM · STANFORD CAMPUS';
  const ringLeft = sys.ring.cx * w - sys.orbitR - 0.022 * w;
  let infoSize = 0.030 * h;
  while (typeWidth(ctx, infoStr, { weight: 600, tracking: 0.10, size: infoSize }) > ringLeft - m && infoSize > 0.016 * h) infoSize *= 0.96;
  let yy = baseY + 0.118 * h;
  drawType(ctx, infoStr, m, yy, { size: infoSize, weight: 600, tracking: 0.10, color: INK });
  yy += 0.052 * h;
  drawType(ctx, COPY.progMini, m, yy, { size: 0.0235 * h, weight: 400, mono: true, tracking: 0.04, color: rgba(INK, 0.9) });

  // footer rule + caption
  const fy = 0.895 * h;
  ruleLine(ctx, sys, m, leftW, fy, 0.85);
  physicsCaption(ctx, sys, m, fy + 0.038 * h, 0.0235 * h, 'left');
  ctx.fillStyle = RED;
  ctx.fillRect(leftW - 0.020 * h, fy + 0.016 * h, 0.020 * h, 0.020 * h);
}

function layoutStory(ctx, sys, u) {
  const { w, h, m, S } = sys;
  const topY = m * 1.4;
  kickerLine(ctx, sys, topY, 0.0165);
  drawType(ctx, COPY.dateShort, w - m, topY, { size: 0.0165 * S, weight: 600, tracking: 0.22, color: INK, align: 'right' });
  ruleLine(ctx, sys, m, w - m, topY + 0.016 * S, 0.9);

  const baseY = PRE.hero.base * h;
  heroBlock(ctx, sys, baseY, PRE.hero.wf * (w - 2 * m));
  physicsCaption(ctx, sys, w - m, sys.ring.cy + sys.orbitR + 0.045 * S, 0.0128 * S, 'right');

  const gy = baseY + 0.055 * h;
  drawType(ctx, 'SUN DEC 13 2026 · 5:00 PM', m, gy, { size: 0.0180 * S, weight: 600, tracking: 0.10, color: INK });
  drawType(ctx, 'STANFORD CAMPUS', w - m, gy, { size: 0.0180 * S, weight: 600, tracking: 0.10, color: INK, align: 'right' });
  ruleLine(ctx, sys, m, w - m, gy + 0.018 * S, 0.85);
  drawType(ctx, COPY.progMini, m, gy + 0.048 * S, { size: 0.0126 * S, weight: 400, mono: true, tracking: 0.05, color: rgba(INK, 0.9) });
}

/* ═════════════════════════ frame ═════════════════════════ */

function drawPoster(ctx, sys, u) {
  drawPaper(ctx, sys);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  drawBeamAxis(ctx, sys, u);
  drawRings(ctx, sys, u);
  drawEcal(ctx, sys, u);
  drawTracksAndMuons(ctx, sys, u);
  drawBunches(ctx, sys, u);
  drawIP(ctx, sys);

  // typography
  ctx.lineCap = 'butt';
  if (PRE.layout === 'portrait') layoutPortrait(ctx, sys, u);
  else if (PRE.layout === 'square') layoutSquare(ctx, sys, u);
  else if (PRE.layout === 'wide') layoutWide(ctx, sys, u);
  else if (PRE.layout === 'story') layoutStory(ctx, sys, u);

  ctx.restore();

  // paper grain over everything (static — printed, not simulated film)
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(GRAIN, 0, 0, sys.w, sys.h);
  ctx.restore();
}

/* ═════════════════════════ p5 wiring ═════════════════════════ */

let P5I = null;
window.__posterReady = false;

const sketch = (p) => {
  let ctx;
  p.setup = () => {
    p.pixelDensity(1);
    const c = p.createCanvas(W, H);
    ctx = c.elt.getContext('2d');
    GRAIN = buildGrain(W, H);
    SYS = buildSystem(p);
    if (!ANIM) {
      p.noLoop();
      window.__setPhase(T0);
    }
    // live view: fit to window via CSS (capture mode keeps native pixels)
    if (ANIM) {
      const fit = Math.min(window.innerWidth / W, window.innerHeight / H, 1);
      c.elt.style.width = Math.round(W * fit) + 'px';
      c.elt.style.height = Math.round(H * fit) + 'px';
    } else {
      c.elt.style.width = W + 'px';
      c.elt.style.height = H + 'px';
    }
    window.__posterReady = true;
  };
  p.draw = () => {
    if (!ANIM) return;
    const u = (p.millis() / 1000 / LOOP_SECONDS) % 1;
    drawPoster(ctx, SYS, u);
  };
  window.__setPhase = (u) => {
    drawPoster(ctx, SYS, ((u % 1) + 1) % 1);
  };
};

/* start after fonts are genuinely ready (greek + latin + mono) */
const FONT_LOADS = [
  '400 24px "Inter Tight"', '500 24px "Inter Tight"', '600 24px "Inter Tight"',
  '700 24px "Inter Tight"', '800 24px "Inter Tight"',
  '400 24px "JetBrains Mono"', '500 24px "JetBrains Mono"', '700 24px "JetBrains Mono"',
];
Promise.all(FONT_LOADS.map((f) => document.fonts.load(f, 'σμµ×·γZX0123456789')))
  .then(() => document.fonts.ready)
  .then(() => { P5I = new p5(sketch); });
