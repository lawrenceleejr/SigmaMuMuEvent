/* σμμ — propagating Feynman-network background.
 *
 * One mesh is built across the viewport with the poster's own generator, so the
 * line vocabulary is identical: straight fermions, drawn waves for the bosons,
 * dashes for the scalars, a node at every junction, an x wherever a line ends
 * in the vacuum. Every vertex is a legal Standard Model vertex, same as print.
 *
 * The animation is a flood over that graph. A direction-biased Dijkstra gives
 * every edge an arrival distance, and because the preferred heading drifts as
 * the flood travels, the front wanders instead of expanding as a disc. A frame
 * draws the edges whose arrival falls inside (head - tail, head]: the shape
 * grows at the head and dissolves at the tail, so a blob propagates across the
 * field. Scroll lengthens the tail — at the bottom of the page nothing
 * dissolves any more and the whole field is lit.
 *
 * Two walkers run out of phase so that one is always mid-life while the other
 * re-seeds, and the background never empties.
 *
 * The canvas is deliberately drawn at low resolution: it sits behind a frosted
 * panel, and `SCALE` below zooms the diagram geometry (wavelengths, dash
 * lengths, node radii) along with the spacing, so the linework stays readable
 * as physics through the blur.
 */
(function () {
  'use strict';

  var SCALE = 2.8;           // diagram zoom: wave and dash geometry scale with it
  var SPACING = 24;          // times SCALE -> ~67px cells
  // Canvas resolution. What costs is the total pixel count, not the ratio, so
  // budget pixels rather than capping the ratio: a phone (small viewport, dense
  // screen) gets its full device resolution for less fill than a laptop at 2x.
  // Never below 1, which is already native on an ordinary display.
  var PIXEL_BUDGET = 2.2e6;
  // If the machine cannot paint that budget smoothly, something has to give.
  // Frame rate goes first and resolution only after: this field drifts, and
  // nothing in it moves fast enough for 30 frames a second to read as choppy,
  // whereas resizing the backing store is plainly visible — it reallocates,
  // which blanks the canvas for a frame, and the linework steps softer. Three
  // of those in the first ten seconds is what "it glitches after a while"
  // turned out to be.
  //
  // So: hold 60, then cap at 30, then 20, and only a machine that still
  // cannot keep up at 20 starts giving up resolution. Never back up — a
  // governor that recovers oscillates, and a background that keeps changing
  // its mind is worse than one that settled somewhere lower.
  var SLOW_FRAME = 1 / 38;   // seconds: below ~38 fps counts as slow
  var ADAPT_EVERY = 2.0;     // seconds between decisions
  var ADAPT_STEP = 0.8;      // multiply the resolution by this each step
  var DPR_FLOOR = 0.75;      // never softer than this
  var FPS_CAPS = [0, 1 / 30, 1 / 20];   // the ladder, in seconds per frame
  var WALKERS = 2;
  var TRAVERSE = 34;         // seconds for a walker to cross its whole flood
  var TAIL_TOP = 0.18;       // tail as a fraction of the flood, at the top
  var TAIL_BOTTOM = 1.3;     // at the bottom: longer than the flood, nothing dies
  var FADE = 0.34;           // fraction of the tail spent fading out

  var cv = document.getElementById('field');
  if (!cv || !window.SMMNet) return;
  var ctx = cv.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var accent = (getComputedStyle(document.documentElement)
    .getPropertyValue('--accent') || '#ec3013').trim();

  var W = 0, H = 0, DPR = 1, net = null, walkers = [], maxArrival = 1, raf = null;
  // Per-frame scratch, one slot per edge and per vertex, sized in build().
  var eGrow, eTone, eRev, vTone, vIsX;
  var BUCKETS = 16;          // tone steps the fade is quantised to for batching
  var scrollP = 0;

  /* ---- the mesh ---------------------------------------------------------- */
  // The canvas is sized in CSS with lvh, which stays put while a mobile URL
  // bar shows and hides; window.innerHeight does not, and rebuilding the mesh
  // on that change is what made the field jump about on scroll.
  function viewport() {
    var r = cv.getBoundingClientRect();
    return { w: Math.max(320, Math.round(r.width)), h: Math.max(320, Math.round(r.height)) };
  }

  function dprFor(w, h) {
    var device = window.devicePixelRatio || 1;
    return Math.min(device, Math.max(1, Math.sqrt(PIXEL_BUDGET / (w * h))));
  }

  // Only the backing store: the element's own box stays CSS-driven, so
  // measuring it back still reports the viewport rather than what we set.
  function sizeBacking() {
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  var frameEma = 1 / 60, adaptClock = 0, warmup = 3.0, capStep = 0;
  function adapt(dt) {
    if (window.SMM_FIXED_DPR) return;               // harnesses that compare pixels pin it
    // The first seconds are slow on any machine — fonts, images and the mesh
    // are all still arriving — and must not be read as a slow machine.
    if (warmup > 0) { warmup -= dt; return; }
    if (document.readyState !== 'complete') return;  // resources still arriving
    frameEma += (dt - frameEma) * 0.08;
    adaptClock += dt;
    if (adaptClock < ADAPT_EVERY) return;
    adaptClock = 0;
    // Judge each rung against its own target, not against 60. Capped at 30,
    // frames are 33 ms apart because that is what was asked for — read that
    // as "still too slow" and the governor walks the whole ladder down on a
    // machine that was keeping up fine.
    var want = Math.max(SLOW_FRAME, FPS_CAPS[capStep] * 1.25);
    if (frameEma <= want) return;
    if (capStep < FPS_CAPS.length - 1) {
      capStep++;                                      // slow down before softening
    } else if (DPR > DPR_FLOOR) {
      DPR = Math.max(DPR_FLOOR, DPR * ADAPT_STEP);
      sizeBacking();
    } else {
      return;                                         // nothing left to give
    }
    frameEma = 1 / 60;                                // judge the new setting on its own frames
  }

  function build() {
    var v = viewport();
    W = v.w;
    H = v.h;
    // Keep whatever the governor has already learned about this machine. Reset
    // to the full budget on every rebuild and a window drag walks the whole
    // ladder down again, resize by visible resize.
    DPR = Math.min(dprFor(W, H), DPR || Infinity);
    sizeBacking();

    net = window.SMMNet.build({
      w: W, h: H, zones: [], seed: (Math.random() * 1e9) | 0,
      seeds: [{ x: W * 0.5, y: H * 0.5 }],
      spacing: SPACING, keep: 0.72, speed: 120, darts: 40000,
      pad: -SCALE * 26,                       // let the mesh run off the edges
      clearance: 0, clearanceAt: function () { return 0; },
      scaleAt: function () { return SCALE; },  // uniform, and zoomed up
      cornerR: 0,                             // corners are off-screen anyway
      maxLegs: 4, minSep: 0.42, minSepHard: 0.25, minComponent: 4,
      fermionShare: 0.5, higgsShare: 0.18, splitQuads: false,
      higgsPure: 3, higgsQuartics: 1,
    });

    // adjacency once; the flood re-walks it on every re-seed
    net.inc = net.verts.map(function () { return []; });
    net.edges.forEach(function (e, i) { net.inc[e.a].push(i); net.inc[e.b].push(i); });

    eGrow = new Float32Array(net.edges.length);
    eTone = new Float32Array(net.edges.length);
    eRev = new Uint8Array(net.edges.length);
    vTone = new Float32Array(net.verts.length);
    vIsX = new Uint8Array(net.verts.length);   // a vertex that ends a line in the vacuum takes an x
    net.edges.forEach(function (e) { if (e.xa) vIsX[e.a] = 1; if (e.xb) vIsX[e.b] = 1; });

    walkers = [];
    for (var k = 0; k < WALKERS; k++) walkers.push(seedWalker(k / WALKERS));
  }

  /* ---- direction-biased flood -------------------------------------------- */
  // A plain Dijkstra spreads as a disc. Multiplying each edge's cost by how far
  // it points from a slowly drifting heading makes the front travel instead:
  // cheap along the heading, expensive across it.
  function flood(startVertex) {
    var n = net.edges.length;
    var arrive = new Float64Array(n);
    var rev = new Uint8Array(n);   // 1 = the flood reached this edge at its b end
    for (var i = 0; i < n; i++) arrive[i] = Infinity;
    var seen = new Float64Array(net.verts.length);
    for (var v = 0; v < seen.length; v++) seen[v] = Infinity;

    var th0 = Math.random() * Math.PI * 2;
    var l1 = 900 + Math.random() * 1400, l2 = 320 + Math.random() * 500;
    var p1 = Math.random() * 6.28, p2 = Math.random() * 6.28;
    var heading = function (d) {
      return th0 + 1.15 * Math.sin(d / l1 + p1) + 0.5 * Math.sin(d / l2 + p2);
    };

    var heap = [[0, startVertex]];
    seen[startVertex] = 0;
    var far = 0;
    while (heap.length) {
      // small binary heap, inline
      var top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; sift(heap, 0); }
      var d = top[0], u = top[1];
      if (d > seen[u] + 1e-9) continue;
      if (d > far) far = d;
      var list = net.inc[u];
      for (var j = 0; j < list.length; j++) {
        var ei = list[j], e = net.edges[ei];
        var o = e.a === u ? e.b : e.a;
        var ax = net.verts[o][0] - net.verts[u][0];
        var ay = net.verts[o][1] - net.verts[u][1];
        var phi = Math.atan2(ay, ax);
        var bias = 1 + 2.6 * (1 - Math.cos(phi - heading(d)));
        var nd = d + e.len * bias;
        if (nd < arrive[ei]) { arrive[ei] = nd; rev[ei] = e.b === u ? 1 : 0; }
        if (nd < seen[o] - 1e-9) {
          seen[o] = nd;
          heap.push([nd, o]);
          up(heap, heap.length - 1);
        }
      }
    }
    return { arrive: arrive, rev: rev, far: far || 1 };
  }
  function up(h, i) {
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      var t = h[p]; h[p] = h[i]; h[i] = t; i = p;
    }
  }
  function sift(h, i) {
    for (;;) {
      var l = i * 2 + 1, r = l + 1, m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      var t = h[m]; h[m] = h[i]; h[i] = t; i = m;
    }
  }

  function seedWalker(phase) {
    var used = [];
    net.edges.forEach(function (e) { used.push(e.a); });
    var start = used.length ? used[(Math.random() * used.length) | 0] : 0;
    var f = flood(start);
    maxArrival = Math.max(maxArrival, f.far);
    return { arrive: f.arrive, rev: f.rev, far: f.far, head: phase * f.far };
  }

  /* ---- drawing ----------------------------------------------------------- */
  // Every frame used to restroke every lit edge on its own: one path built
  // point by point in JS, one stroke, two vertex marks, a dash reset — and
  // twice over wherever the two walkers overlapped. Six hundred to a thousand
  // draw calls a frame on a laptop, more on a big display, and the cost scales
  // with the viewport rather than staying put. It read as choppy on desktops
  // while a phone, with a tenth of the edges, never noticed.
  //
  // Now the frame is gathered first and painted once. Each edge's strongest
  // state across the walkers is kept, fully grown edges are collected into one
  // Path2D per line type and tone step and stroked in a handful of calls, and
  // vertex marks are drawn once per vertex rather than once per incident edge.
  // Only edges still growing are drawn individually, since they need their own
  // partial path and direction. The geometry of each edge is cached as a Path2D
  // the first time it is seen.

  function edgePath(e) {
    if (e.__p2d) return e.__p2d;
    var pts = window.SMMNet.pathPoints(net, e);
    var p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    e.__p2d = p;
    return p;
  }

  // Which tone step a value falls in. The top step is exactly 1, so the fully
  // lit majority paints identically to before; the fade below it is quantised
  // to sixteenths, which the eye does not pick out.
  function bucketOf(t) { return t >= 1 ? BUCKETS - 1 : Math.floor(t * BUCKETS); }
  function toneOf(b) { return b === BUCKETS - 1 ? 1 : (b + 0.5) / BUCKETS; }

  function gather(frac) {
    eGrow.fill(0);
    eTone.fill(0);
    var edges = net.edges;
    for (var k = 0; k < walkers.length; k++) {
      var w = walkers[k], tail = w.far * frac, lo = w.head - tail;
      for (var i = 0; i < edges.length; i++) {
        var a = w.arrive[i];
        if (!isFinite(a) || a > w.head || a < lo) continue;
        // The head end draws part-grown, on the poster's own growth curve: a
        // quintic ease-out, so each line leaps out and then creeps to length.
        var lin = Math.min(1, (w.head - a) / (edges[i].len * 2.2));
        var grow = Math.max(0.02, 1 - Math.pow(1 - lin, 5.5));
        var age = (w.head - a) / tail;                 // 0 at the head, 1 at the tail
        var tone = age > 1 - FADE ? Math.max(0, (1 - age) / FADE) : 1;
        if (tone <= 0.01) continue;
        if (grow > eGrow[i]) { eGrow[i] = grow; eRev[i] = w.rev[i]; }
        if (tone > eTone[i]) eTone[i] = tone;
      }
    }
  }

  function paint() {
    var N = window.SMMNet, edges = net.edges, verts = net.verts;
    var s = SCALE, lwf = 0.8 + 0.3 * s;     // scaleAt is uniform here: one weight per type
    ctx.clearRect(0, 0, W, H);

    var lines = [[], [], []];               // [fermion, boson, scalar][tone step] -> Path2D
    var dots = [], crosses = [], partial = [];
    vTone.fill(0);
    for (var i = 0; i < edges.length; i++) {
      var g = eGrow[i];
      if (g <= 0) continue;
      var e = edges[i], t = eTone[i];
      if (g < 1) { partial.push(i); continue; }
      var ti = e.type === 'h' ? 2 : (e.type === 'b' ? 1 : 0);
      var b = bucketOf(t);
      (lines[ti][b] || (lines[ti][b] = new Path2D())).addPath(edgePath(e));
      if (t > vTone[e.a]) vTone[e.a] = t;
      if (t > vTone[e.b]) vTone[e.b] = t;
    }

    // the same strokes drawEdge would make, a type and a tone step at a time
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var ty = 0; ty < 3; ty++) {
      var col = ty === 2 ? accent : N.INK;
      var alpha = ty === 0 ? 0.88 : (ty === 1 ? 0.72 : 0.85);
      ctx.lineWidth = (ty === 1 ? 1.15 : 1.35) * lwf;
      ctx.setLineDash(ty === 2 ? [6.5 * s, 6.5 * s] : []);
      for (var bb = 0; bb < BUCKETS; bb++) {
        var P = lines[ty][bb];
        if (!P) continue;
        ctx.strokeStyle = N.rgba(col, alpha * toneOf(bb));
        ctx.stroke(P);
      }
    }
    ctx.setLineDash([]);

    // growing lines keep their own path, direction and origin mark
    for (var k = 0; k < partial.length; k++) {
      var j = partial[k];
      N.drawEdge(ctx, net, edges[j], eGrow[j], { accent: accent, tone: eTone[j], rev: !!eRev[j] });
    }

    // one mark per vertex, at the strongest tone of any line touching it
    var rr = 1.8 * (0.72 + 0.5 * s), q = 3.4 * (0.72 + 0.5 * s);
    for (var v = 0; v < verts.length; v++) {
      var tv = vTone[v];
      if (tv <= 0) continue;
      var vb = bucketOf(tv), x = verts[v][0], y = verts[v][1];
      if (vIsX[v]) {
        var C = crosses[vb] || (crosses[vb] = new Path2D());
        C.moveTo(x - q, y - q); C.lineTo(x + q, y + q);
        C.moveTo(x + q, y - q); C.lineTo(x - q, y + q);
      } else {
        var D = dots[vb] || (dots[vb] = new Path2D());
        D.moveTo(x + rr, y); D.arc(x, y, rr, 0, Math.PI * 2);
      }
    }
    ctx.lineWidth = 1.3 * lwf;
    for (var mb = 0; mb < BUCKETS; mb++) {
      var tm = toneOf(mb);
      if (dots[mb]) { ctx.fillStyle = N.rgba(N.INK, 0.92 * tm); ctx.fill(dots[mb]); }
      if (crosses[mb]) { ctx.strokeStyle = N.rgba(N.INK, 0.88 * tm); ctx.stroke(crosses[mb]); }
    }
  }

  var last = 0, painted = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    // A background nobody is looking at should cost nothing.
    if (document.hidden) { last = 0; return; }
    var cap = FPS_CAPS[capStep];
    if (cap && painted && (ts - painted) / 1000 < cap - 0.002) return;
    painted = ts;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;

    // Tail and speed both scale with the walker's own flood, so the animation
    // behaves the same however dense the mesh is.
    var frac = TAIL_TOP + (TAIL_BOTTOM - TAIL_TOP) * Math.pow(scrollP, 1.25);
    adapt(dt);
    for (var k = 0; k < walkers.length; k++) {
      var w = walkers[k];
      if (!reduced) w.head += (w.far / TRAVERSE) * dt;
      if (w.head - w.far * frac > w.far) walkers[k] = seedWalker(0);  // spent: begin again
    }
    gather(frac);
    paint();
  }

  function onScroll() {
    var max = document.documentElement.scrollHeight - H;
    scrollP = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  var rt = null;
  function onResize() {
    var v = viewport();
    // Only a genuine resize or a rotation earns a new mesh. Small height-only
    // changes are the mobile browser chrome, and rebuilding on those is a jump.
    if (v.w === W && Math.abs(v.h - H) < H * 0.2) { onScroll(); return; }
    clearTimeout(rt);
    rt = setTimeout(function () { build(); onScroll(); }, 200);
  }

  function start() {
    build();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    if (reduced) {
      // settle to a full field and hold it
      walkers.forEach(function (w) { w.head = w.far; });
      gather(2);
      paint();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start, start);
  else start();
})();
