/* The presenter screen at /bg.
 *
 * Two canvases. The back one carries the generated mesh and animates on the
 * website's rules — site/static/js/field.js — because giving every line its
 * own looping clock, which is what this page did first, bunches them up and
 * the whole field re-emerges at once. Instead one or two walkers flood the
 * mesh from a single vertex each, a direction-biased Dijkstra so the front
 * travels rather than spreading as a disc, and a line only starts drawing
 * when the flood reaches it — out of the vertex it arrived at, on the
 * poster's growth curve. Behind the head the field holds, and the tail fades
 * it out again. The front one carries the hand-drawn VBF diagram and the legs
 * grown out of it; that is painted once and left, because it is the thing on
 * the screen meant to be read and it should not blink out halfway through a
 * coffee break.
 *
 * Painting is batched the way site/static/js/field.js batches it: same-tone,
 * same-type lines go into one Path2D and are stroked together, marks once per
 * vertex. A projector is an unknown machine, often without a GPU, and this is
 * the difference between a smooth field and a slideshow.
 */
(function () {
  var live = document.getElementById('live');
  var still = document.getElementById('still');
  if (!live || !still || !window.SMMNet || !window.SMMVBF) return;
  var lx = live.getContext('2d'), sx = still.getContext('2d');

  var INK = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  var ACCENT = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  var PIXEL_BUDGET = 3.5e6;      // past this the fill rate costs more than the sharpness
  var WALKERS = 2;               // out of phase, so the field is never empty
  var TRAVERSE = 30;             // seconds for a walker to cross its whole flood
  var TAIL = 0.85;               // tail as a fraction of the flood. The website
                                 // takes this from the scroll; there is nothing
                                 // to scroll here, so it is held generous: a
                                 // wide lit region with a front and a wake.
  var FADE = 0.34;               // fraction of the tail spent fading out
  var BUCKETS = 12;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, DPR = 1, U = 0, MESH_S = 1;
  var drawn = null, mesh = null, baseTone = null, walkers = null;
  var eGrow = null, eTone = null, eRev = null, vIsX = null;

  function sizeOf() {
    W = Math.max(320, window.innerWidth);
    H = Math.max(240, window.innerHeight);
    // The budget only stops the canvas supersampling a big screen; it never
    // takes it below one device pixel per CSS pixel. adapt() does that, and
    // only on a machine that turns out to need it.
    DPR = Math.min(window.devicePixelRatio || 1,
                   Math.max(1, Math.sqrt(PIXEL_BUDGET / (W * H))));
    backing();
  }
  function backing() {
    [live, still].forEach(function (cv) {
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
    });
    lx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* A projector is an unknown machine. If the frames come back slow — a 4K
     panel driven without acceleration is the case that bites — trade some
     resolution for a steady rate rather than let the field stutter. It only
     ever steps down, after a warm-up, and stops at 0.6. */
  var SLOW_FRAME = 1 / 38, ADAPT_EVERY = 2, ADAPT_STEP = 0.8, DPR_FLOOR = 0.6;
  var frameEma = 1 / 60, adaptClock = 0, warmup = 3;
  function adapt(dt) {
    if (warmup > 0) { warmup -= dt; return; }
    frameEma += (dt - frameEma) * 0.08;
    adaptClock += dt;
    if (adaptClock < ADAPT_EVERY) return;
    adaptClock = 0;
    if (frameEma > SLOW_FRAME && DPR > DPR_FLOOR) {
      DPR = Math.max(DPR_FLOOR, DPR * ADAPT_STEP);
      backing();
      paintStill();
      frameEma = 1 / 60;
    }
  }

  var CX = 0, CY = 0;
  function build() {
    sizeOf();
    // The diagram is ten and a half units across, so on a tall screen the
    // width is what limits it, not the height. Taking the smaller of the two
    // keeps it inside the frame instead of running off both edges — and it is
    // a feature in a field rather than the whole screen, so it sits well
    // inside both.
    U = Math.min(H / 21, W / 16);
    // And the line scale follows that unit rather than the screen width. Tied
    // to width, a phone got a scale of 0.2 while the geometry stayed sized off
    // height: eleven wave cycles along an edge the desktop draws with three.
    var ref = U / (1080 / 17);
    var CORE_S = 2.9 * ref;
    MESH_S = 2.1 * ref;
    CX = W / 2;
    CY = H > W ? H * 0.56 : H / 2;      // held tall: down, clear of the masthead
    drawn = window.SMMVBF.build({ w: W, h: H, unit: U, cx: CX, cy: CY,
      seed: (Math.random() * 1e9) | 0, coreScale: CORE_S, meshScale: MESH_S });
    mesh = window.SMMNet.build({
      w: W, h: H, zones: window.SMMVBF.zones(drawn, U * 0.3),
      seed: (Math.random() * 1e9) | 0, seeds: [{ x: CX, y: CY }],
      // build() multiplies spacing by scaleAt, which is also the line weight,
      // so the separation is asked for in units of the frame and divided back
      // out — otherwise a 4K screen gets a field twice as coarse as a laptop.
      // 40k darts lands within a few per cent of the mesh 160k gives and
      // builds in a quarter of the time, which is what somebody waits
      // through when they pull this up mid-break.
      spacing: U * 0.93 / MESH_S, keep: 0.72, speed: 120, darts: 40000,
      pad: -U * 0.5, clearance: 0, clearanceAt: function () { return 0; },
      scaleAt: function () { return MESH_S; },
      cornerR: 0, maxLegs: 4, minSep: 0.42, minSepHard: 0.25, minComponent: 3,
      fermionShare: 0.5, higgsShare: 0.18, splitQuads: false,
      higgsPure: 7, higgsQuartics: 2,
    });

    mesh.inc = mesh.verts.map(function () { return []; });
    mesh.edges.forEach(function (e, i) { mesh.inc[e.a].push(i); mesh.inc[e.b].push(i); });

    baseTone = new Float32Array(mesh.edges.length);
    mesh.edges.forEach(function (e, i) {
      var p = mesh.verts[e.a], q = mesh.verts[e.b];
      var d = Math.hypot(((p[0] + q[0]) / 2 - CX) / (W / 2),
                         ((p[1] + q[1]) / 2 - CY) / (H / 2));
      baseTone[i] = 0.5 * (1 - 0.4 * Math.min(1, d));   // the vignette
      e.__p2d = null; e.__pts = null; e.__ptsR = null;
    });
    eGrow = new Float32Array(mesh.edges.length);
    eTone = new Float32Array(mesh.edges.length);
    eRev = new Uint8Array(mesh.edges.length);
    vTone = new Float32Array(mesh.verts.length);
    vIsX = new Uint8Array(mesh.verts.length);
    mesh.edges.forEach(function (e) { if (e.xa) vIsX[e.a] = 1; if (e.xb) vIsX[e.b] = 1; });

    // The first walker starts at the diagram, so the page opens by growing out
    // of it; the ones that follow start wherever, and wander.
    walkers = [];
    for (var k = 0; k < WALKERS; k++) walkers.push(seedWalker(k / WALKERS, k === 0));
    paintStill();
  }

  // The diagram and its grown legs, once.
  function paintStill() {
    sx.clearRect(0, 0, W, H);
    for (var i = drawn.edges.length - 1; i >= drawn.coreEdges; i--) {
      var e = drawn.edges[i];
      var p = drawn.verts[e.a], q = drawn.verts[e.b];
      var d = Math.hypot(((p[0] + q[0]) / 2 - CX) / (W / 2),
                         ((p[1] + q[1]) / 2 - CY) / (H / 2));
      window.SMMNet.drawEdge(sx, drawn, e, 1,
        { accent: ACCENT, ink: INK, tone: 0.88 * (1 - 0.34 * Math.min(1, d)) });
    }
    for (var j = 0; j < drawn.coreEdges; j++) {
      window.SMMNet.drawEdge(sx, drawn, drawn.edges[j], 1,
        { accent: ACCENT, ink: INK, tone: 1 });
    }
  }

  /* ---- the flood -------------------------------------------------------- */
  /* Straight from the website. A plain Dijkstra from a vertex spreads as a
     disc; multiplying each edge's cost by how far it points from a slowly
     drifting heading makes the front travel instead — cheap along the
     heading, expensive across it. Each edge records the distance at which the
     flood reached it and which of its two ends it arrived at, which is the
     end the line then grows out of. */
  function flood(startVertex) {
    var n = mesh.edges.length;
    var arrive = new Float64Array(n), rev = new Uint8Array(n);
    for (var i = 0; i < n; i++) arrive[i] = Infinity;
    var seen = new Float64Array(mesh.verts.length);
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
      var top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; sift(heap, 0); }
      var d = top[0], u = top[1];
      if (d > seen[u] + 1e-9) continue;
      if (d > far) far = d;
      var list = mesh.inc[u];
      for (var j = 0; j < list.length; j++) {
        var ei = list[j], e = mesh.edges[ei];
        var o = e.a === u ? e.b : e.a;
        var phi = Math.atan2(mesh.verts[o][1] - mesh.verts[u][1],
                             mesh.verts[o][0] - mesh.verts[u][0]);
        var nd = d + e.len * (1 + 2.6 * (1 - Math.cos(phi - heading(d))));
        if (nd < arrive[ei]) { arrive[ei] = nd; rev[ei] = e.b === u ? 1 : 0; }
        if (nd < seen[o] - 1e-9) { seen[o] = nd; heap.push([nd, o]); up(heap, heap.length - 1); }
      }
    }
    return { arrive: arrive, rev: rev, far: far || 1 };
  }
  function up(h, i) {
    while (i > 0) {
      var pi = (i - 1) >> 1;
      if (h[pi][0] <= h[i][0]) break;
      var t = h[pi]; h[pi] = h[i]; h[i] = t; i = pi;
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

  function seedWalker(phase, atDiagram) {
    var start = 0;
    if (atDiagram) {
      var best = Infinity;
      for (var v = 0; v < mesh.verts.length; v++) {
        if (!mesh.inc[v].length) continue;
        var d = Math.hypot(mesh.verts[v][0] - CX, mesh.verts[v][1] - CY);
        if (d < best) { best = d; start = v; }
      }
    } else {
      var live = [];
      mesh.edges.forEach(function (e) { live.push(e.a); });
      start = live.length ? live[(Math.random() * live.length) | 0] : 0;
    }
    var f = flood(start);
    return { arrive: f.arrive, rev: f.rev, far: f.far, head: phase * f.far };
  }

  // Each edge keeps the strongest state across the walkers: how far it has
  // grown, how lit it is, and which end it is growing out of.
  function gather(frac) {
    eGrow.fill(0); eTone.fill(0);
    var edges = mesh.edges;
    for (var k = 0; k < walkers.length; k++) {
      var w = walkers[k], tail = w.far * frac, lo = w.head - tail;
      for (var i = 0; i < edges.length; i++) {
        var a = w.arrive[i];
        if (!isFinite(a) || a > w.head || a < lo) continue;
        // The head end draws part-grown on the poster's curve: a quintic
        // ease-out, so each line leaps out of its vertex and then creeps.
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

  function p2d(e) {
    if (e.__p2d) return e.__p2d;
    var pts = window.SMMNet.pathPoints(mesh, e);
    var path = new Path2D();
    path.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    e.__p2d = path;
    return path;
  }

  var lines, dots, crosses, vTone;
  function allocate() {
    lines = { f: [], b: [], h: [] };
    ['f', 'b', 'h'].forEach(function (t) {
      for (var i = 0; i < BUCKETS; i++) lines[t].push(new Path2D());
    });
    dots = []; crosses = [];
    for (var i = 0; i < BUCKETS; i++) { dots.push(new Path2D()); crosses.push(new Path2D()); }
    vTone.fill(0);
  }
  var bucketOf = function (t) { return Math.max(0, Math.min(BUCKETS - 1, (t * BUCKETS) | 0)); };
  var toneOf = function (b) { return b === BUCKETS - 1 ? 1 : (b + 0.5) / BUCKETS; };

  function paint() {
    var N = window.SMMNet, edges = mesh.edges;
    var lwf = 0.8 + 0.3 * MESH_S;
    lx.clearRect(0, 0, W, H);
    allocate();

    var partial = [];
    for (var i = 0; i < edges.length; i++) {
      var g = eGrow[i];
      if (g <= 0) continue;
      var tone = eTone[i] * baseTone[i];          // the fade, under the vignette
      if (tone < 0.02) continue;
      if (g < 1) { partial.push(i); continue; }
      var e = edges[i], b = bucketOf(tone);
      lines[e.type][b].addPath(p2d(e));
      if (tone > vTone[e.a]) vTone[e.a] = tone;
      if (tone > vTone[e.b]) vTone[e.b] = tone;
    }

    lx.lineCap = 'round';
    lx.lineJoin = 'round';
    for (var b2 = 0; b2 < BUCKETS; b2++) {
      var tn = toneOf(b2);
      lx.setLineDash([]);
      lx.strokeStyle = N.rgba(INK, 0.88 * tn);
      lx.lineWidth = 1.35 * lwf; lx.stroke(lines.f[b2]);
      lx.strokeStyle = N.rgba(INK, 0.72 * tn);
      lx.lineWidth = 1.15 * lwf; lx.stroke(lines.b[b2]);
      lx.setLineDash([6.5 * MESH_S, 6.5 * MESH_S]);
      lx.strokeStyle = N.rgba(ACCENT, 0.85 * tn);
      lx.lineWidth = 1.35 * lwf; lx.stroke(lines.h[b2]);
    }
    lx.setLineDash([]);

    // A growing line keeps its own path, its direction and its origin mark, so
    // it goes through drawEdge rather than into a bucket. Only the thin band at
    // the head is ever in this state.
    for (var k = 0; k < partial.length; k++) {
      var j = partial[k];
      N.drawEdge(lx, mesh, edges[j], eGrow[j],
        { accent: ACCENT, ink: INK, tone: eTone[j] * baseTone[j], rev: !!eRev[j] });
    }

    // one mark per vertex, at the strongest tone of any line touching it
    var rr = 1.8 * (0.72 + 0.5 * MESH_S), q = 3.4 * (0.72 + 0.5 * MESH_S);
    for (var v = 0; v < vTone.length; v++) {
      if (vTone[v] < 0.02) continue;
      var bk = bucketOf(vTone[v]), P = mesh.verts[v];
      if (vIsX[v]) {
        crosses[bk].moveTo(P[0] - q, P[1] - q); crosses[bk].lineTo(P[0] + q, P[1] + q);
        crosses[bk].moveTo(P[0] + q, P[1] - q); crosses[bk].lineTo(P[0] - q, P[1] + q);
      } else {
        dots[bk].moveTo(P[0] + rr, P[1]);
        dots[bk].arc(P[0], P[1], rr, 0, Math.PI * 2);
      }
    }
    lx.lineWidth = 1.3 * lwf;
    for (var b3 = 0; b3 < BUCKETS; b3++) {
      var tn3 = toneOf(b3);
      lx.fillStyle = N.rgba(INK, 0.92 * tn3);
      lx.fill(dots[b3]);
      lx.strokeStyle = N.rgba(INK, 0.88 * tn3);
      lx.stroke(crosses[b3]);
    }
  }

  var lastFrame = 0;
  function frame(now) {
    var t = now / 1000;
    var dt = lastFrame ? Math.min(0.05, t - lastFrame) : 1 / 60;
    lastFrame = t;
    adapt(dt);
    for (var k = 0; k < walkers.length; k++) {
      var w = walkers[k];
      w.head += (w.far / TRAVERSE) * dt;
      if (w.head - w.far * TAIL > w.far) walkers[k] = seedWalker(0, false);   // spent
    }
    gather(TAIL);
    paint();
    requestAnimationFrame(frame);
  }

  /* ---- the announcement ------------------------------------------------- */
  var input = document.getElementById('say-input');
  var say = document.getElementById('say');
  var body = document.body;

  function fit() {
    var text = input.value.replace(/\s+/g, ' ').trim();
    say.textContent = text;
    body.classList.toggle('has-say', !!text);
    if (!text) return;
    // Fit to the band rather than to a formula: a short announcement fills it,
    // a long one steps down until it does, and either way it is as large as it
    // can be from the back of the room.
    var budget = window.innerHeight * 0.24;
    var lo = window.innerHeight * 0.024, hi = window.innerHeight * 0.13;
    for (var i = 0; i < 16; i++) {
      var mid = (lo + hi) / 2;
      say.style.fontSize = mid + 'px';
      if (say.getBoundingClientRect().height <= budget) lo = mid; else hi = mid;
    }
    say.style.fontSize = lo + 'px';
  }
  var queued = false;
  function fitSoon() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; fit(); });
  }
  input.addEventListener('input', fitSoon);

  /* ---- music ------------------------------------------------------------ */
  /* Apple Music, and only if this page has been given a developer token and a
     playlist. The plain embed.music.apple.com iframe cannot do what was asked:
     it has no shuffle, and being cross-origin it cannot be told to start from
     out here — the listener has to press play inside it. MusicKit can do both,
     at the cost of a token.

     Full-length playback needs whoever is at the machine to be signed in to an
     Apple Music subscription; without one Apple serves previews or refuses.
     Everything below fails quietly: the screen is the point, and a room should
     not be looking at a stack trace because the wifi ate a token. */
  var music = (function () {
    var cfg = window.SMM_MUSIC;
    if (!cfg || !cfg.token || !cfg.playlist) return null;
    var kit = null, on = true;

    document.addEventListener('musickitloaded', function () {
      try {
        MusicKit.configure({
          developerToken: cfg.token,
          app: { name: cfg.name || 'sigma mu mu', build: '1' },
        }).then(function (m) { kit = m; }, function () {});
      } catch (e) {}
    });

    // authorize() opens Apple's sign-in window, so it has to be the first
    // thing a click does — after an await the browser no longer counts the
    // gesture and the window is blocked.
    function begin() {
      if (!kit) return Promise.reject();
      return kit.isAuthorized ? Promise.resolve() : kit.authorize();
    }
    return {
      enabled: function () { return on; },
      toggle: function () {
        on = !on;
        if (!on) { this.stop(); } else { begin().catch(function () {}); }
        return on;
      },
      start: function () {
        if (!on || !kit) return;
        begin()
          .then(function () { return kit.setQueue({ playlist: cfg.playlist, startPlaying: false }); })
          .then(function () { kit.shuffleMode = 1; return kit.play(); })
          .catch(function () {});
      },
      stop: function () {
        try { if (kit && kit.isPlaying) kit.pause(); } catch (e) {}
      },
    };
  })();

  /* ---- presenting ------------------------------------------------------- */
  /* iPhone Safari has no Fullscreen API — not on the document element, not
     prefixed — so a presenting mode that waits for requestFullscreen simply
     never starts, and the controls stay on screen. So presenting is our own
     state: the chrome goes on a class, and real full screen is asked for on
     top of that only where it exists. A tap or a click anywhere leaves, which
     is the only gesture a phone has; Esc leaves too, and so does the browser
     dropping out of full screen by itself. Nothing on screen says so — the
     bar says it before you go in, and a screen in a room should be clean. */
  var btn = document.getElementById('fs');
  var presenting = false, enteredAt = 0;

  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  function enter() {
    presenting = true;
    enteredAt = Date.now();
    body.classList.add('present');
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { try { req.call(el); } catch (e) { /* denied is fine — the chrome is gone anyway */ } }
    if (music) music.start();          // before any await, so the gesture counts
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    // On a later tick, or the click that started this would end it.
    setTimeout(function () { document.addEventListener('click', leaveOnTap, true); }, 0);
  }

  function leave() {
    presenting = false;
    if (music) music.stop();
    body.classList.remove('present');
    document.removeEventListener('click', leaveOnTap, true);
    if (isFull()) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { try { ex.call(document); } catch (e) {} }
    }
  }

  function leaveOnTap(ev) {
    if (Date.now() - enteredAt < 350) return;
    ev.preventDefault();
    ev.stopPropagation();
    leave();
  }

  btn.addEventListener('click', function () { if (presenting) leave(); else enter(); });

  var mbtn = document.getElementById('music');
  if (mbtn && music) {
    mbtn.hidden = false;
    // Pressing it before the room fills gets Apple's sign-in out of the way.
    mbtn.addEventListener('click', function () {
      mbtn.textContent = music.toggle() ? 'Music: on' : 'Music: off';
    });
  }
  document.addEventListener('keydown', function (e) {
    if (presenting && (e.key === 'Escape' || e.key === 'Esc')) leave();
  });
  // Where full screen is real, Esc is handled by the browser: follow it out.
  function followBrowser() { if (presenting && !isFull()) leave(); }
  document.addEventListener('fullscreenchange', followBrowser);
  document.addEventListener('webkitfullscreenchange', followBrowser);

  /* ---- go --------------------------------------------------------------- */
  var resizeTimer = 0, lastW = 0, lastH = 0;
  window.addEventListener('resize', function () {
    // A phone's address bar sliding away changes the height and nothing else.
    // Rebuilding for that costs a second and hands back a different field, so
    // only a real change of screen counts.
    var w = window.innerWidth, h = window.innerHeight;
    if (w === lastW && Math.abs(h - lastH) / Math.max(1, lastH) < 0.2) return;
    lastW = w; lastH = h;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      warmup = 3; frameEma = 1 / 60;      // a new screen deserves a fresh look
      build(); fit();
    }, 250);
  });

  build();
  lastW = window.innerWidth; lastH = window.innerHeight;
  if (reduce) {
    // Asked for less motion: hand back the finished field and hold it. The
    // head is put well past the far end and the tail made longer still, so
    // every line is fully grown and none of them is inside the fade.
    walkers.forEach(function (w) { w.head = w.far * 3; });
    gather(10);
    paint();
  } else {
    requestAnimationFrame(frame);
  }
})();
