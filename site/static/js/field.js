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
  var DPR = 0.9;             // the field is blurred; no need for device pixels
  var WALKERS = 2;
  var TRAVERSE = 34;         // seconds for a walker to cross its whole flood
  var TAIL_TOP = 0.18;       // tail as a fraction of the flood, at the top
  var TAIL_BOTTOM = 1.3;     // at the bottom: longer than the flood, nothing dies
  var FADE = 0.34;           // fraction of the tail spent fading out
  var ZOOM = 0.14;           // how far the field pushes in by the foot of the page
  var ZOOM_EASE = 3.5;       // per second: how fast the zoom chases the scroll

  var cv = document.getElementById('field');
  if (!cv || !window.SMMNet) return;
  var ctx = cv.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var accent = (getComputedStyle(document.documentElement)
    .getPropertyValue('--accent') || '#ec3013').trim();

  var W = 0, H = 0, net = null, walkers = [], maxArrival = 1, raf = null;
  var scrollP = 0;
  var zoom = 1;              // eased toward the scroll target, so it never steps

  /* ---- the mesh ---------------------------------------------------------- */
  // The canvas is sized in CSS with lvh, which stays put while a mobile URL
  // bar shows and hides; window.innerHeight does not, and rebuilding the mesh
  // on that change is what made the field jump about on scroll.
  function viewport() {
    var r = cv.getBoundingClientRect();
    return { w: Math.max(320, Math.round(r.width)), h: Math.max(320, Math.round(r.height)) };
  }

  function build() {
    var v = viewport();
    W = v.w;
    H = v.h;
    // Only the backing store: the element's own box stays CSS-driven, so
    // measuring it back still reports the viewport rather than what we set.
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    applyZoom();

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
  // Scroll pushes the field in a little. Scaling about the canvas centre keeps
  // the mesh registered with the panes; the mesh already runs off every edge,
  // so pushing in never exposes a border.
  function applyZoom() {
    var k = DPR * zoom;
    ctx.setTransform(k, 0, 0, k, DPR * (W / 2) * (1 - zoom), DPR * (H / 2) * (1 - zoom));
  }

  function drawWalker(w, tail) {
    var edges = net.edges;
    var lo = w.head - tail;
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
      window.SMMNet.drawEdge(ctx, net, edges[i], grow,
        { accent: accent, tone: tone, rev: !!w.rev[i] });
    }
  }

  var last = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;

    // Tail and speed both scale with the walker's own flood, so the animation
    // behaves the same however dense the mesh is.
    var frac = TAIL_TOP + (TAIL_BOTTOM - TAIL_TOP) * Math.pow(scrollP, 1.25);

    // Chase the scroll target rather than snap to it: touch scroll arrives in
    // lumps, and a lerp turns those into a smooth push.
    zoom += ((1 + ZOOM * scrollP) - zoom) * Math.min(1, dt * ZOOM_EASE);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    applyZoom();
    for (var k = 0; k < walkers.length; k++) {
      var w = walkers[k];
      if (!reduced) w.head += (w.far / TRAVERSE) * dt;
      if (w.head - w.far * frac > w.far) walkers[k] = seedWalker(0);  // spent: begin again
      drawWalker(walkers[k], walkers[k].far * frac);
    }
  }

  function onScroll() {
    var max = document.documentElement.scrollHeight - H;
    scrollP = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    document.documentElement.style.setProperty('--scroll', scrollP.toFixed(4));
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
      ctx.clearRect(0, 0, W, H);
      walkers.forEach(function (w) { drawWalker(w, w.far * 2); });
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start, start);
  else start();
})();
