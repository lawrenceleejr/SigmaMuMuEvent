/* The presenter screen at /bg.
 *
 * Two canvases. The back one carries the generated mesh and animates: every
 * line draws itself on the same curve the poster uses — 1-(1-t)^5.5, fast out
 * of the vertex then a long decay — holds, fades, and comes back, staggered by
 * its graph distance from the middle so the waves sweep outward. The front one
 * carries the hand-drawn VBF diagram and the legs grown out of it; that is
 * painted once and left, because it is the thing on the screen meant to be
 * read and it should not blink out halfway through a coffee break.
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
  var CYCLE = 34;                // seconds for one pass of the field
  var GROW_END = 0.2, FADE_AT = 0.78, SPREAD = 0.55;
  var BUCKETS = 12;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, DPR = 1, U = 0, MESH_S = 1;
  var drawn = null, mesh = null, phase = null, baseTone = null;

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
    // keeps it inside the frame instead of running off both edges.
    U = Math.min(H / 17, W / 13);
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

    var maxT = 0;
    mesh.edges.forEach(function (e) { if (e.t0 > maxT) maxT = e.t0; });
    phase = new Float32Array(mesh.edges.length);
    baseTone = new Float32Array(mesh.edges.length);
    mesh.edges.forEach(function (e, i) {
      phase[i] = maxT ? e.t0 / maxT : 0;
      var p = mesh.verts[e.a], q = mesh.verts[e.b];
      var d = Math.hypot(((p[0] + q[0]) / 2 - CX) / (W / 2),
                         ((p[1] + q[1]) / 2 - CY) / (H / 2));
      baseTone[i] = 0.5 * (1 - 0.4 * Math.min(1, d));   // the vignette
      e.__p2d = null;
    });
    vTone = new Float32Array(mesh.verts.length);
    vIsX = new Uint8Array(mesh.verts.length);
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

  function p2d(e) {
    if (e.__p2d) return e.__p2d;
    var pts = window.SMMNet.pathPoints(mesh, e);
    var path = new Path2D();
    path.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    e.__p2d = path;
    return path;
  }

  // A line still growing is stroked as a prefix of its own path, so it can go
  // into the same bucket as the finished ones instead of costing a draw call
  // of its own — a fifth of the field is mid-growth at any moment, which is
  // enough per-call state changes to cost more than the pixels do.
  function prefix(e, frac) {
    var pts = window.SMMNet.pathPoints(mesh, e);
    var total = pts.length - 1;
    var reach = total * Math.max(0.015, Math.min(1, frac));
    var whole = Math.floor(reach);
    var path = new Path2D();
    path.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i <= Math.min(whole, total); i++) path.lineTo(pts[i][0], pts[i][1]);
    if (whole < total) {
      var u = reach - whole, p = pts[whole], q = pts[whole + 1];
      path.lineTo(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u);
    }
    return path;
  }

  var lines, dots, crosses, vTone, vIsX;
  function allocate() {
    lines = { f: [], b: [], h: [] };
    ['f', 'b', 'h'].forEach(function (t) {
      for (var i = 0; i < BUCKETS; i++) lines[t].push(new Path2D());
    });
    dots = []; crosses = [];
    for (var i = 0; i < BUCKETS; i++) { dots.push(new Path2D()); crosses.push(new Path2D()); }
    vTone.fill(0); vIsX.fill(0);
  }
  var bucketOf = function (t) { return Math.max(0, Math.min(BUCKETS - 1, (t * BUCKETS) | 0)); };
  var toneOf = function (b) { return b === BUCKETS - 1 ? 1 : (b + 0.5) / BUCKETS; };

  var lastFrame = 0;
  function frame(now) {
    var t = now / 1000;
    if (!reduce) {
      adapt(lastFrame ? Math.min(0.05, t - lastFrame) : 1 / 60);
      lastFrame = t;
    }
    lx.clearRect(0, 0, W, H);
    allocate();

    for (var i = 0; i < mesh.edges.length; i++) {
      var e = mesh.edges[i];
      var u = reduce ? 1 : ((t / CYCLE - phase[i] * SPREAD) % 1 + 1) % 1;
      var frac = 1, alpha = 1;
      if (!reduce) {
        if (u < GROW_END) {
          var g = u / GROW_END;
          frac = 1 - Math.pow(1 - g, 5.5);              // the poster's growth curve
          alpha = Math.min(1, g * 12);
        } else if (u > FADE_AT) {
          alpha = (1 - u) / (1 - FADE_AT);
        }
      }
      var tone = baseTone[i] * alpha;
      if (tone < 0.02) continue;
      var b = bucketOf(tone);
      var done = frac >= 0.999;
      lines[e.type][b].addPath(done ? p2d(e) : prefix(e, frac));
      // build() orients every edge so `a` is the end the growth reached first,
      // so that vertex is already there; the far one appears on arrival.
      if (tone > vTone[e.a]) { vTone[e.a] = tone; vIsX[e.a] = e.xa ? 1 : 0; }
      if (done && tone > vTone[e.b]) { vTone[e.b] = tone; vIsX[e.b] = e.xb ? 1 : 0; }
    }

    var lwf = 0.8 + 0.3 * MESH_S;
    lx.lineCap = 'round';
    lx.lineJoin = 'round';
    for (var b2 = 0; b2 < BUCKETS; b2++) {
      var tn = toneOf(b2);
      lx.setLineDash([]);
      lx.strokeStyle = window.SMMNet.rgba(INK, 0.88 * tn);
      lx.lineWidth = 1.35 * lwf; lx.stroke(lines.f[b2]);
      lx.strokeStyle = window.SMMNet.rgba(INK, 0.72 * tn);
      lx.lineWidth = 1.15 * lwf; lx.stroke(lines.b[b2]);
      lx.setLineDash([6.5 * MESH_S, 6.5 * MESH_S]);
      lx.strokeStyle = window.SMMNet.rgba(ACCENT, 0.85 * tn);
      lx.lineWidth = 1.35 * lwf; lx.stroke(lines.h[b2]);
    }
    lx.setLineDash([]);

    // marks, once per vertex rather than once per line that touches it
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
    for (var b3 = 0; b3 < BUCKETS; b3++) {
      var tn3 = toneOf(b3);
      lx.fillStyle = window.SMMNet.rgba(INK, 0.92 * tn3);
      lx.fill(dots[b3]);
      lx.strokeStyle = window.SMMNet.rgba(INK, 0.88 * tn3);
      lx.lineWidth = 1.3 * lwf;
      lx.stroke(crosses[b3]);
    }

    if (!reduce) requestAnimationFrame(frame);
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
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    // On a later tick, or the click that started this would end it.
    setTimeout(function () { document.addEventListener('click', leaveOnTap, true); }, 0);
  }

  function leave() {
    presenting = false;
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
  if (reduce) frame(0); else requestAnimationFrame(frame);
})();
