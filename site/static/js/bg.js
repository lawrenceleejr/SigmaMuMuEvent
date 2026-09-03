/* The presenter screen at /bg.
 *
 * This is the website's background — site/static/js/field.js — put on a
 * screen for the room, and it is deliberately the same mechanic and nothing
 * more. One or two walkers flood the generated mesh from a single vertex
 * each, by a direction-biased Dijkstra so the front travels rather than
 * spreading as a disc; a line starts drawing only when the flood reaches it,
 * out of the vertex it arrived at, on the poster's growth curve; behind the
 * head the field holds and the tail fades it out again. The website takes the
 * tail length from the scroll, and there is nothing to scroll here, so it is
 * held at a fixed generous value.
 *
 * The one addition is the VBF diagram, nine hand-drawn lines held still in
 * the middle on their own canvas with the mesh kept off them. An earlier
 * version grew a whole legal tree out of its six legs, which took the picture
 * a long way from the website it is supposed to match; that is gone. Set
 * `diagram: false` in site/content/bg.md and the page is the website's field
 * exactly.
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
  var wantDiagram = window.SMM_BG_DIAGRAM !== false;

  var W = 0, H = 0, DPR = 1, U = 0, MESH_S = 1;
  var drawn = null, mesh = null, baseTone = null, walkers = null;
  var eGrow = null, eTone = null, eRev = null, vIsX = null;
  var meshBend = null, joins = 0;

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

  /* ---- wiring the diagram into the field --------------------------------- */
  /* The diagram used to stop dead: six legs ending in a vacuum × while the
     mesh went about its business around them, which reads as a diagram pasted
     on top of a field rather than part of one.

     Joining them looks impossible at first, because every mesh vertex is
     already a legal interaction of degree three or four and hanging another
     leg on one makes it four or five — and five is never legal. For a fermion
     leg the arithmetic closes off completely: to land on a legal four-leg
     vertex the mesh vertex would have to be carrying one fermion and two
     bosons, and a fermion line is continuous, so no vertex anywhere ever has
     an odd number of fermion legs.

     But the mesh has loose ends of its own — that is what its own × marks are
     — and there are two legal things to do with one:

       · An end of the same kind as the leg is not a vertex at all. It is one
         propagator carrying on, with a kink where the two halves were drawn
         from opposite ends. Nothing interacts there, so there is nothing to be
         legal or illegal about, and both × marks go. This is what the two
         Higgs legs get.

       · A loose boson or Higgs end landing partway along a fermion leg is ffV
         or a Yukawa: the mesh's dangling photon, gluon or Higgs turns out to
         have been radiated by our own quark. A real interaction, marked with a
         dot, and legal — bff and ffh are both in the table. This is what the
         four fermion legs get, and it is why they can be joined at all: the
         mesh has no loose fermion end to offer them, ever.

       · A leg can also run straight into an existing mesh vertex, if what that
         vertex is then carrying is itself a legal interaction. The table is
         asked rather than second-guessed, which is what makes this safe: it
         admits a Higgs leg onto an hVV or an hhh (giving hhVV, hhhh) and turns
         every fermion attempt down flat, because a legal vertex never carries
         an odd number of fermion legs.

     Both kinds go in as mesh edges rather than onto the diagram's static
     canvas, so the flood runs through them and the field visibly reaches out
     and takes hold of the diagram as the front arrives. Each loose end serves
     one leg. */
  function joinDiagram(core, mesh, U) {
    if (!core) return 0;

    var clear = U * 0.26;     // and the berth the join keeps from everything else
    var minRun = U * 0.16;    // shorter than this and there is no line to see

    function side(a, b, c) {
      return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    }
    function crosses(p1, p2, p3, p4) {
      return side(p1, p2, p3) * side(p1, p2, p4) < 0
          && side(p3, p4, p1) * side(p3, p4, p2) < 0;
    }
    function ptSeg(p, s0, s1) {
      var vx = s1[0] - s0[0], vy = s1[1] - s0[1];
      var wx = p[0] - s0[0], wy = p[1] - s0[1];
      var L2 = vx * vx + vy * vy || 1;
      var t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2));
      return Math.hypot(wx - vx * t, wy - vy * t);
    }
    /* Clear of every line except the two it is being made between.
       The berth is not asked for near the join's own ends. Lines that meet at
       a vertex are touching there by definition, so measuring the distance to
       them from the last stretch of the join always fails — which had every
       one of these joins turned down flat at the junction it was aimed at.
       Crossings are still tested along the whole length; it is only the
       keep-out that stops at the doorstep. */
    function ok(from, to, skipMesh, skipCore) {
      var pairs = [[mesh, skipMesh], [core, skipCore]];
      var free = clear * 1.15;
      for (var L = 0; L < pairs.length; L++) {
        var net = pairs[L][0], skip = pairs[L][1];
        for (var i = 0; i < net.edges.length; i++) {
          if (i === skip) continue;
          var p = net.verts[net.edges[i].a], q = net.verts[net.edges[i].b];
          if (crosses(from, to, p, q)) return false;
          for (var k = 1; k < 10; k++) {
            var u = k / 10;
            var m = [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u];
            if (Math.hypot(m[0] - from[0], m[1] - from[1]) < free) continue;
            if (Math.hypot(m[0] - to[0], m[1] - to[1]) < free) continue;
            if (ptSeg(m, p, q) < clear) return false;
          }
        }
      }
      return true;
    }

    // Every legal Standard Model vertex, as render/audit_vertices.mjs has it.
    var LEGAL = { bff: 1, bbff: 1, ffh: 1, bbb: 1, bbbb: 1, bbh: 1, bbhh: 1,
                  hhh: 1, hhhh: 1 };
    function legal(types, add) {
      var t = types.concat([add]);
      return t.length <= 4 && !!LEGAL[t.slice().sort().join('')];
    }

    // The mesh's vertices: what meets each, and which single line where that
    // is a loose end.
    // Plain arrays, not typed ones: the joins add vertices as they go, and
    // these have to grow with them.
    var mdeg = [], mone = [], mtypes = [];
    for (var q = 0; q < mesh.verts.length; q++) { mdeg.push(0); mone.push(-1); mtypes.push([]); }
    mesh.edges.forEach(function (e, i) {
      mdeg[e.a]++; mdeg[e.b]++; mone[e.a] = i; mone[e.b] = i;
      mtypes[e.a].push(e.type); mtypes[e.b].push(e.type);
    });
    var ends = [];
    for (var v = 0; v < mesh.verts.length; v++) {
      if (mdeg[v] === 1 && mone[v] >= 0) {
        ends.push({ v: v, e: mone[v], type: mesh.edges[mone[v]].type, used: false });
      }
    }

    // The diagram's leg tips: its degree-one vertices, and the leg each ends.
    var deg = {}, one = {};
    core.edges.forEach(function (e, i) {
      deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1;
      one[e.a] = i; one[e.b] = i;
    });
    var legs = Object.keys(deg).filter(function (k) { return deg[k] === 1; })
      .map(function (k) { return { v: +k, e: one[+k] }; });

    // The diagram end of a join is always either a kink or a vertex the still
    // canvas has already drawn, so it never wants a mark of its own. The mesh
    // end wants one only where the join makes a real vertex there — hence
    // `kink`, which paint() reads to decide.
    function addJoin(from, to, type, s, kink) {
      var tip = mesh.verts.push([from[0], from[1]]) - 1;
      mesh.edges.push({
        a: tip, b: to, type: type, s: s, xa: false, xb: false,
        len: Math.hypot(mesh.verts[to][0] - from[0], mesh.verts[to][1] - from[1]),
        join: true, kink: !!kink,
      });
      mtypes[to].push(type); mdeg[to]++;
      mtypes.push([type]); mdeg.push(1); mone.push(mesh.edges.length - 1);
      return tip;
    }

    var joined = 0;
    function tryLeg(leg, reach) {
      var ce = core.edges[leg.e], want = ce.type;
      var tipEnd = ce.a === leg.v ? 'xa' : 'xb';
      var from = core.verts[leg.v];

      // First choice: an end of the same kind, met head on.
      var best = null, bd = reach;
      ends.forEach(function (en) {
        if (en.used || en.type !== want) return;
        var d = Math.hypot(mesh.verts[en.v][0] - from[0], mesh.verts[en.v][1] - from[1]);
        if (d < bd && d > minRun && ok(from, mesh.verts[en.v], en.e, leg.e)) { bd = d; best = en; }
      });
      if (best) {
        addJoin(from, best.v, want, mesh.edges[best.e].s, true);
        ce[tipEnd] = false;                    // one propagator, so no × either side
        best.used = true; joined++;
        return true;
      }

      // Second choice: straight into a mesh vertex that can legally take it.
      // Our own tip becomes a kink — the propagator carries on and interacts
      // over there — so its × goes and the mark at the far end is the mesh's
      // own, already drawn.
      var at = -1, ad = reach;
      for (var v2 = 0; v2 < mesh.verts.length; v2++) {
        if (!mtypes[v2].length || !legal(mtypes[v2], want)) continue;
        var d2 = Math.hypot(mesh.verts[v2][0] - from[0], mesh.verts[v2][1] - from[1]);
        if (d2 >= ad || d2 <= minRun) continue;
        if (!ok(from, mesh.verts[v2], -1, leg.e)) continue;
        ad = d2; at = v2;
      }
      if (at >= 0) {
        // A mesh kink is a bend, not an interaction; making it carry a third
        // line makes it one, so it gets its dot back.
        if (mesh.bend && mesh.bend[at]) mesh.bend[at] = 0;
        addJoin(from, at, want, mesh.edges[mone[at] >= 0 ? mone[at] : 0].s, false);
        ce[tipEnd] = false;
        joined++;
        return true;
      }
      if (want !== 'f') return false;

      // Otherwise, for a fermion: a loose boson end radiated off the leg. The
      // landing point is where that end comes closest to the leg, held away
      // from both of its ends so the new vertex is not on top of another.
      var other = core.verts[ce.a === leg.v ? ce.b : ce.a];
      var vx = from[0] - other[0], vy = from[1] - other[1];
      var L2 = vx * vx + vy * vy || 1;
      var pick = null, pd = reach, pAt = null;
      ends.forEach(function (en) {
        if (en.used || en.type === 'f') return;
        if (!legal([want, want], en.type)) return;      // ffV or a Yukawa
        var q = mesh.verts[en.v];
        var t = ((q[0] - other[0]) * vx + (q[1] - other[1]) * vy) / L2;
        t = Math.max(0.34, Math.min(0.82, t));
        var P = [other[0] + vx * t, other[1] + vy * t];
        var d = Math.hypot(q[0] - P[0], q[1] - P[1]);
        // A Higgs tap is legal (ffh, a Yukawa) but it draws in the accent and
        // dashes, so a handful of them around the diagram reads as a different
        // picture. Weighted back, it wins only when it is clearly the nearer.
        var w = d * (en.type === 'h' ? 1.7 : 1);
        if (w < pd && d > minRun && ok(P, q, en.e, leg.e)) { pd = w; pick = en; pAt = P; }
      });
      // And failing that, a boson the leg radiates into a mesh vertex that can
      // legally carry one. Same interaction at our end, ffV; the difference is
      // only that the line is new rather than one the mesh had left dangling,
      // which is why it comes last — a tap tidies away one of the mesh's own
      // × marks, and this does not.
      if (!pick) {
        for (var v3 = 0; v3 < mesh.verts.length; v3++) {
          if (!mtypes[v3].length || !legal(mtypes[v3], 'b')) continue;
          var r = mesh.verts[v3];
          var t3 = ((r[0] - other[0]) * vx + (r[1] - other[1]) * vy) / L2;
          t3 = Math.max(0.34, Math.min(0.82, t3));
          var P3 = [other[0] + vx * t3, other[1] + vy * t3];
          var d3 = Math.hypot(r[0] - P3[0], r[1] - P3[1]);
          if (d3 >= pd || d3 <= minRun || !ok(P3, r, -1, leg.e)) continue;
          pd = d3; pAt = P3;
          pick = { v: v3, e: mone[v3], type: 'b', fresh: true };
        }
      }
      if (!pick) return false;

      // Split the leg at the landing point. Fermions are drawn as a plain
      // stroke, so the two halves read as the one straight line they were.
      var mid = core.verts.push(pAt) - 1;
      var far = { a: mid, b: leg.v, type: want, s: ce.s, len: 0, xa: false, xb: ce[tipEnd] };
      far.len = Math.hypot(from[0] - pAt[0], from[1] - pAt[1]);
      if (ce.a === leg.v) ce.a = mid; else ce.b = mid;
      ce[tipEnd] = false;                      // the × moved out to the new far half
      ce.len = Math.hypot(other[0] - pAt[0], other[1] - pAt[1]);
      ce.__p2d = ce.__pts = ce.__ptsR = null;
      core.edges.push(far);

      if (pick.fresh && mesh.bend && mesh.bend[pick.v]) mesh.bend[pick.v] = 0;
      addJoin(pAt, pick.v, pick.type,
              mesh.edges[pick.e >= 0 ? pick.e : 0].s, !pick.fresh);
      pick.used = true; joined++;
      return true;
    }

    // Everything close by first — a leg that has a neighbour should take it,
    // not lose it to a leg on the far side reaching across. Then one longer
    // look for whatever is left over, so a leg is only abandoned when there
    // really is nothing it can legally meet.
    var left = legs.filter(function (l) { return !tryLeg(l, U * 3.6); });
    left.forEach(function (l) { tryLeg(l, U * 5.6); });
    return joined;
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
    // gens/minGens 0 stops after the nine hand-drawn lines: no growth, which
    // is what took this away from the website's design in the first place.
    drawn = wantDiagram ? window.SMMVBF.build({ w: W, h: H, unit: U, cx: CX, cy: CY,
      seed: (Math.random() * 1e9) | 0, coreScale: CORE_S, meshScale: MESH_S,
      gens: 0, minGens: 0 }) : null;
    mesh = window.SMMNet.build({
      w: W, h: H, zones: drawn ? window.SMMVBF.zones(drawn, U * 0.3) : [],
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

    joins = joinDiagram(drawn, mesh, U);

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
    // The diagram end of every join is either a kink or a vertex the still
    // canvas draws, so it is never marked here. The mesh end is marked unless
    // the join made a kink of it, where one line simply carries on.
    meshBend = new Uint8Array(mesh.verts.length);
    mesh.edges.forEach(function (e) {
      if (!e.join) return;
      meshBend[e.a] = 1;
      if (e.kink) meshBend[e.b] = 1;
    });

    // The first walker starts at the diagram, so the page opens by growing out
    // of it; the ones that follow start wherever, and wander.
    walkers = [];
    for (var k = 0; k < WALKERS; k++) walkers.push(seedWalker(k / WALKERS, k === 0));
    paintStill();
  }

  // The diagram, once.
  function paintStill() {
    sx.clearRect(0, 0, W, H);
    if (!drawn) return;
    for (var j = 0; j < drawn.edges.length; j++) {
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
      if (vTone[v] < 0.02 || meshBend[v]) continue;
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
